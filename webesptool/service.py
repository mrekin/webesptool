import json
from enum import Enum
from typing import Optional

class FirmwareType(Enum):
    MESHTASTIC = "meshtastic"
    MESHCORE = "meshcore"

import utils.logger

from fastapi import FastAPI, Request
from contextlib import asynccontextmanager
from fastapi.responses import JSONResponse

import uvicorn

from threading import Thread
from fastapi import APIRouter
from fastapi import Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

import aiofiles
import yaml
from jsonmerge import merge

# News module
from apps.news.routes import router as news_router

import aiofiles.ospath
import aiofiles.os
import os
import re
import markdown
import zipfile
from pathlib import Path
from looseversion import LooseVersion
import io
import mimetypes
import aiohttp

# Partition parser import with graceful degradation
from utils.partition_parser import (
        parse_partitions_file,
        format_analysis,
        find_partition_by_type,
    )




class CustomLooseVersion(LooseVersion):
    def parse(self, vstring):
        # I've given up on thinking I can reconstruct the version string
        # from the parsed tuple -- so I just store the string here for
        # use by __str__
        self.vstring = vstring
        components = re.split(r'[\. ]',vstring)
        for i, obj in enumerate(components):
            try:
                components[i] = int(obj)
            except ValueError:
                pass

        self.version = components

    def _cmp (self, other):
        if isinstance(other, str):
            other = CustomLooseVersion(other)
        elif not isinstance(other, CustomLooseVersion):
            return NotImplemented

        #If elements has different types - compare as strings
        max_len = max(len(self.version), len(other.version))
        for i in range(max_len):
            try:
                # If one version has more components, it's considered newer
                if i >= len(other.version):
                    return 1
                if i >= len(self.version):
                    return -1

                if type(self.version[i]) != type(other.version[i]):
                    self.version[i] = str(self.version[i])
                    other.version[i] = str(other.version[i])
            except Exception as e:
                pass

        if "daily" in self.vstring and "daily" not in other.vstring and self.version[:len(self.version)-1] == other.version[:len(other.version)-1]:
            return 1
        if "daily" not in self.vstring and "daily" in other.vstring and self.version[:len(self.version)-1] == other.version[:len(other.version)-1]:
            return -1

        if self.version == other.version:
            return 0
        if self.version < other.version:
            return -1
        if self.version > other.version:
            return 1


# Copied from device-install.sh
BIGDB_8MB=(
	"picomputer-s3"
	"unphone"
	"seeed-sensecap-indicator"
	"crowpanel-esp32s3"
	"heltec_capsule_sensor_v3"
	"heltec-v3"
	"heltec-vision-master-e213"
	"heltec-vision-master-e290"
	"heltec-vision-master-t190"
	"heltec-wireless-paper"
	"heltec-wireless-tracker"
	"heltec-wsl-v3"
	"icarus"
	"seeed-xiao-s3"
	"tbeam-s3-core"
	"tracksenger"
)
BIGDB_16MB=(
	"t-deck"
	"mesh-tab"
	"t-energy-s3"
	"dreamcatcher"
	"ESP32-S3-Pico"
	"m5stack-cores3"
	"station-g2"
    "t-eth-elite"
    "t-watch-s3"
    "elecrow-adv-35-tft"
    "elecrow-adv-24-28-tft"
    "elecrow-adv1-43-50-70-tft"
)
S3_VARIANTS=(
    "s3"
    "-v3"
    "t-deck"
    "wireless-paper"
    "wireless-tracker"
    "station-g2"
    "unphone"
    "t-eth-elite"
    "mesh-tab"
    "dreamcatcher"
    "ESP32-S3-Pico"
    "seeed-sensecap-indicator"
    "heltec_capsule_sensor_v3"
    "vision-master"
    "icarus"
    "tracksenger"
    "elecrow-adv"
)

#period_pattern = re.compile("^\d{4}-\d{1,2}$")
fwfiles = None

log = utils.logger.getLogger()
DEBUG2 =5

config = {}

aiofiles.os.walk = aiofiles.os.wrap(os.walk)

def loadConfig():
    global config
    with open('config/config.yml', 'r') as f:
        cfg_data = yaml.safe_load(f)

        base = cfg_data['base']
        diff = cfg_data['enviroments'][cfg_data['enviroment']]
        base = base if base else {}
        diff = diff if diff else {}
        config = merge(base, diff)


hidden_regex = re.compile(r"^_.*")


async def getAvailableFirmwares(src = None, rootFolder = None, t:str = None):
    data = {"espdevices":[], "uf2devices":[], "rp2040devices":[], "versions":[], "device_names":[]}

    uf2files_pattern = re.compile(r".*\.uf2")
    otafiles_pattern = re.compile(r".*\.zip")


    # Builds output folders with pattern 'device'/'version'
    #rootFolder = None

    uf2devices = set()
    espdevices = set()
    rp2040devices = set()
    versions = set()
    device_names = {}

    rootFolder, src, fw_type = await getRootFolder(src=src)

    paths = [rf if isinstance(rf, str) else rf.get('path', None) for rf in config['fwDirs']]
    srcs =  [{'src': rf.get('src', None), 'desc': rf.get('desc', ''), 'type': rf.get('type', 'meshtastic')} for rf in config['fwDirs'] if isinstance(rf,dict) and rf.get('src', None)]
    src_values = [s['src'] for s in srcs]
    if not rootFolder and src in src_values:
        for rf in config['fwDirs']:
            if isinstance(rf,dict) and src == rf.get('src', None) and rf.get('path', None):
                rootFolder = rf.get('path')
                break

    # Get devices and versions at first path if not provided
    if not rootFolder and paths:
        rootFolder = paths[0]
    if rootFolder:
        address_pattern = re.compile("^"+rootFolder+"[^/]+$")
        for address, dirs, files in await aiofiles.os.walk(rootFolder, topdown=True, onerror=None, followlinks=False):
            if address == rootFolder:
                pass
            if bool(address_pattern.match(address)):
                if bool(hidden_regex.match(Path(address).name)):
                    log.info(f"Skipping device {Path(address).name} - marked as hidden")
                    continue

                # Find device.info file and read it as json if exists
                content = None
                jdev = None
                for file in files:
                    if "device.info" == file:
                        if(await aiofiles.os.path.isfile(os.path.join(address,file))):
                            async with aiofiles.open(os.path.join(address,file),'r') as f:
                                content = await f.read()
                            if content:
                                jdev = json.loads(content)
                                if(jdev.get('name')):
                                    if(jdev.get('type')=='esp32'):
                                        espdevices.add(Path(address).name)
                                    if(jdev.get('type')=='nrf52'):
                                        uf2devices.add(Path(address).name)
                                    if(jdev.get('type')=='rp2040'):
                                        rp2040devices.add(Path(address).name)
                                    device_names[Path(address).name] = jdev.get('name')
                            break

                # Remove hidden versions
                if (t and address.endswith(t)) or (not t):
                    versions = versions.union(set([d for d in dirs if not bool(hidden_regex.match(d))]))
                if not jdev:
                    for d in dirs:
                        files = await aiofiles.os.scandir(os.path.join(address,d))
                        uf2find = False
                        otafind = False
                        for f in files:
                            if uf2files_pattern.match(f.name):
                                #uf2devices.add(Path(address).name)
                                uf2find = True
                                #break
                            if otafiles_pattern.match(f.name):
                                #uf2devices.add(Path(address).name)
                                otafind = True
                                #break
                        if not uf2find:
                            espdevices.add(Path(address).name)
                        if uf2find and otafind: #nrf devices
                            uf2devices.add(Path(address).name)
                        if uf2find and not otafind: #rp2040 devices
                            rp2040devices.add(Path(address).name)


    data["espdevices"] = list(set(data["espdevices"]).union(espdevices))
    data["uf2devices"] = list(set(data["uf2devices"]).union(uf2devices))
    data["rp2040devices"] = list(set(data["rp2040devices"]).union(rp2040devices))
    data["device_names"] = device_names
    data["versions"] = list(set(data["versions"]).union(versions))

    data["espdevices"].sort()
    data["uf2devices"].sort()
    data["rp2040devices"].sort()
    data["srcs"] = srcs


    data["versions"].sort(reverse=True, key=CustomLooseVersion)


    return data

async def buildInfoblock(t:str = None, v:str = None, src:str = None):
    infoblock={'info':""}
    rmfile = "readme.md"

    rootFolder, src, fw_type = await getRootFolder(t,v,src)
    if rootFolder:
        rmfile = os.path.join(rootFolder,t,rmfile)

    try:
        async with aiofiles.open(rmfile,'r') as file:
            content = await file.read()
        html = markdown.markdown(content)
        infoblock['info'] = html
    except Exception as e:
        log.info("readme.md file not found")
        infoblock['info'] = "Readme.md file not found in variant repository"
    return infoblock

async def buildVersions(t:str = None, src:str = None):
    data = {"versions":[]}
    versions_map = {}
    dates_map = {}
    notes_map = {}
    latestTags = {}

    rootFolder, src, fw_type = await getRootFolder(t=t, src=src)

    if rootFolder:
        address_pattern = re.compile("^"+rootFolder+"[^/]+$")

        # Choose regex based on firmware type
        if fw_type == FirmwareType.MESHCORE:
            # Meshcore: v1.11.0.6d32193.companion.ble format
            reg = r"^v(?P<mver>([\w\d]+\.){2}([\w\d]+))\.(?P<n>[\w\d-]+)\.(?P<variant>[^\.]+)(\.(?P<extra>.+))?$"
        else:
            # Meshtastic: v2.4.3.efc27f2 format
            reg = r"^(?P<mver>([\w\d]+\.){2}([\w\d]+))\.(?P<n>[\w\d]+)\.*(?P<daily>daily)*$"

        path = os.path.join(rootFolder,t)
        if os.path.commonprefix((os.path.realpath(path),os.path.realpath(rootFolder))) != os.path.realpath(rootFolder):
            pass # Something incorrect with path, maybe traversal attack
        else:
            for address, dirs, files in await aiofiles.os.walk(path, topdown=True, onerror=None, followlinks=False):
                if address == rootFolder:
                    dataDirs = dirs
                if bool(address_pattern.match(address)):
                    for d in dirs:
                        if bool(hidden_regex.match(d)):
                            log.info(f"Skipping version '{d}' - marked as hidden")
                            continue
                        files = await aiofiles.os.scandir(os.path.join(address,d))
                        info_find = False

                        for file in files:
                            if "ver.info" == file.name:
                                info_find = True
                                break
                        if info_find:
                            content = None
                            async with aiofiles.open(file.path,'r') as f:
                                content = await f.read()
                            if content:
                                jver = json.loads(content)

                                matches= re.search(reg, jver.get('version'))

                                # Assume that `latestTag`` exist only for daily versions
                                if jver.get('latestTag',None):
                                    latestTags[jver.get('version')] = jver.get('latestTag',None)

                                if matches:
                                    if fw_type == FirmwareType.MESHCORE:
                                        # Meshcore: use full version for uniqueness (includes variant)
                                        sver = f"{jver.get('version')} {jver.get('date')} "
                                    else:
                                        # Meshtastic: use mver + date + daily format
                                        sver = f"{matches.group('mver')} {jver.get('date')} {matches.group('daily')}"
                                else:
                                    # Fallback for versions without regex match
                                    sver = f"{jver.get('version')} {jver.get('date')} "
                                versions_map[sver] = jver.get('version')
                                dates_map[jver.get('version')] = jver.get('date')
                                notes_map[jver.get('version')] = jver.get('notes')
                                #data.get('versions',[]).append(sver)
                        else:
                                    #reg = r"^(?P<mver>([\w\d]+\.){2}([\w\d]+))\.(?P<n>[\w\d]+)\.*(?P<daily>daily)*$"
                            matches= re.search(reg, d)
                            if matches:
                                if fw_type == FirmwareType.MESHCORE:
                                    # Meshcore: use full version
                                    sver = f"{d} 00:00:00 "
                                else:
                                    # Meshtastic: use mver format
                                    sver = f"{matches.group('mver')} 00:00:00 {matches.group('daily')}"
                            else:
                                # Fallback for versions without regex match
                                sver = f"{d} 00:00:00 "
                            versions_map[sver] = d
                                    #data.get('versions',[]).append(sver)

    versorted = list(versions_map.keys())
    versorted.sort(reverse=True, key=CustomLooseVersion)
    data["versions"] = [versions_map.get(v) for v in versorted] + data["versions"]
    # Remove possible dublicates
    data["versions"] = list(dict.fromkeys(data["versions"]))
    data["dates"] = dates_map
    data["latestTags"] = latestTags
    data["notes"] = notes_map
    data["src"] = src

    #data["versions"] = list(set(data["versions"]))
    #data["versions"].sort(reverse=True, key=CustomLooseVersion)

    return data

async def loadInfo(t = None, v = None, rootFolder = None):
    jver = {}
    #rootFolder = None
    if rootFolder:
        if not (await aiofiles.os.path.isdir(os.path.join(rootFolder,t,v))):
                rootFolder = None
    if not rootFolder:
        for rf in config['fwDirs']:
            if(await aiofiles.os.path.isdir(os.path.join(rf,t,v))):
                rootFolder = rf
                break
        if not rootFolder:
            return {}


    ipath = os.path.join(rootFolder,t,"device.info")

    if(not await aiofiles.os.path.isfile(ipath)):
            return {}
    content = None
    async with aiofiles.open(ipath,'r') as f:
            content = await f.read()
    if content:
        jver = json.loads(content)

    return jver

async def generate_zip(folder_path, json_data:str = None):
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Добавляем файл с JSON данными
        if json_data:
            json_str = json.dumps(json_data, ensure_ascii=False, indent=2)
            zipf.writestr("manifest.json", json_str)

        # Добавляем файлы из папки
        for root, dirs, files in await aiofiles.os.walk(folder_path):
            for file in files:
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, folder_path)
                zipf.write(file_path, arcname)

    zip_buffer.seek(0)
    return zip_buffer

async def getSrcs():
    srcs = []
    for rf in config['fwDirs']:
        if isinstance(rf, dict):
            srcs.append({
                'src': rf.get('src', None),
                'desc': rf.get('desc', ''),
                'type': rf.get('type', 'meshtastic')
            })
        else:
            # For string entries (legacy), provide default values
            srcs.append({
                'src': rf,
                'desc': '',
                'type': 'meshtastic'
            })
    return srcs

# Search single file in path by regexp mask
# 09.12.2025 firmware files hget new naming so need to implement this search
async def getFileByMask(path, mask):
    fullFileName = None
    fileName = None
    regexp = re.compile(mask)
    #Assume that no need to recurcieve search
    for address, dirs, files in await aiofiles.os.walk(path, topdown=True, onerror=None, followlinks=False):
        for file in files:
            if bool(regexp.match(file)):
                fullFileName = os.path.join(path, file)
                fileName = file
                break

    return fullFileName, fileName

async def getRootFolder(t = None, v = None, src:str = None):
    rootFolder = None
    fw_type = FirmwareType.MESHTASTIC  # default type

    paths = [rf if isinstance(rf, str) else rf.get('path', None) for rf in config['fwDirs']]
    srcs =  [rf.get('src', None) for rf in config['fwDirs'] if isinstance(rf,dict) and rf.get('src', None)]
    if not rootFolder and src in srcs:
        for rf in config['fwDirs']:
            if isinstance(rf,dict) and src == rf.get('src', None) and rf.get('path', None):
                rootFolder = rf.get('path')
                fw_type = FirmwareType(rf.get('type', 'meshtastic'))  # get type from config
                return rootFolder, src, fw_type

    # Get devices and versions at first path if not provided
    if not rootFolder and paths:
        try:
            for rf in paths:
                if v:
                    path = os.path.join(rf,t,v)
                elif t:
                    path = os.path.join(rf,t)
                else:
                    path = os.path.join(rf)
                if(await aiofiles.os.path.isdir(path)):
                    for s in config['fwDirs']:
                        if isinstance(s,dict) and s.get('path', None) == rf:
                            src = s.get('src', None)
                            fw_type = FirmwareType(s.get('type', 'meshtastic'))  # get type from config
                            break
                    return rf, src, fw_type

        except Exception:
            rootFolder = None
    return rootFolder, src, fw_type

async def buildManifest(t:str = None, v:str = None, u:str = "1", src:str = None):
    log.debug("Build manifest: %s, %s for %s",t,v, src)
    manifest = {
        "name": t,
        "version": v,
        "new_install_improv_wait_time": 0,
        "new_install_prompt_erase": True,
        "builds": [
            {
            "chipFamily": "",
            "parts": [
                #{ "path": path, "offset": offset }
            ]
            }
        ]
    }
    rootFolder, src, fw_type = await getRootFolder(t,v,src)
    devinfo = await loadInfo(t,v, rootFolder)

    # === PARSE PARTITIONS.BIN IF AVAILABLE ===
    partitions_offsets = None
    if rootFolder:
        partitions_path = os.path.join(rootFolder, t, v, "partitions.bin")
        if await aiofiles.os.path.isfile(partitions_path):
            log.debug(f"Parsing partitions.bin: {partitions_path}")
            try:
                table = await parse_partitions_file(partitions_path)

                # Get flash size from format_analysis
                analysis_json = format_analysis(table)
                analysis = json.loads(analysis_json)
                flashsize_from_partitions = analysis.get('flash_size_mb')

                # Find partitions by type/subtype (analog findBestMatch from frontend)
                # install_fw_offset: APP type, ota_0 (0x10) or factory (0x00)
                fw_offset = find_partition_by_type(table, 0x00, [0x10, 0x00])

                # install_bleota_offset: APP type, ota_1 (0x11) or ota_0 (0x10) or factory (0x00)
                bleota_offset = find_partition_by_type(table, 0x00, [0x11, 0x10, 0x00])

                # install_littlefs_offset: DATA type, littlefs (0x09) or spiffs (0x08) or custom (0x82)
                littlefs_offset = find_partition_by_type(table, 0x01, [0x09, 0x08, 0x82])

                partitions_offsets = {
                    'flash_size': flashsize_from_partitions,
                    'fw_offset': fw_offset,
                    'bleota_offset': bleota_offset,
                    'littlefs_offset': littlefs_offset
                }

                # Check how many offsets were found
                found_count = sum(1 for k in ['fw_offset', 'bleota_offset', 'littlefs_offset']
                                if partitions_offsets.get(k) is not None)

                if found_count == 3:
                    log.debug(
                        f"Partitions parsed successfully: "
                        f"flash={partitions_offsets.get('flash_size')}, "
                        f"fw=0x{partitions_offsets.get('fw_offset'):x}, "
                        f"bleota=0x{partitions_offsets.get('bleota_offset'):x}, "
                        f"littlefs=0x{partitions_offsets.get('littlefs_offset'):x}"
                    )
                else:
                    log.warning(
                        f"Partitions partially parsed: {found_count}/3 offsets found. "
                        f"fw={partitions_offsets.get('fw_offset')}, "
                        f"bleota={partitions_offsets.get('bleota_offset')}, "
                        f"littlefs={partitions_offsets.get('littlefs_offset')}"
                    )
            except (FileNotFoundError, Exception) as e:
                log.debug(f"Failed to parse partitions.bin: {e}")
                partitions_offsets = None

    # === DETERMINE FLASH SIZE ===
    # Priority: partitions.bin > device.info > BIGDB lists
    flashsize = '4MB'
    if partitions_offsets and partitions_offsets.get('flash_size'):
        flashsize = partitions_offsets['flash_size']
        log.debug(f"Using flashSize from partitions.bin: {flashsize}")
    elif devinfo.get("flashSize", None):
        flashsize = devinfo["flashSize"]
        log.debug(f"Using flashSize from device.info: {flashsize}")
    elif t in BIGDB_8MB:
        flashsize = '8MB'
        log.debug("Using flashSize from BIGDB_8MB")
    elif t in BIGDB_16MB:
        flashsize = '16MB'
        log.debug("Using flashSize from BIGDB_16MB")

    # === DETERMINE OFFSETS ===
    # Priority: partitions.bin > hardcoded fallback values

    # install_fw_offset: partitions.bin > 0 (default)
    if partitions_offsets and partitions_offsets.get('fw_offset') is not None:
        install_fw_offset = partitions_offsets['fw_offset']
        log.debug(f"Using fw_offset from partitions.bin: 0x{install_fw_offset:x}")
    else:
        install_fw_offset = 0
        if partitions_offsets:  # Parsing was done but fw_offset not found
            log.debug("fw_offset not found in partitions.bin, using default: 0x0")

    # install_bleota_offset: partitions.bin > hardcoded by flash size
    if partitions_offsets and partitions_offsets.get('bleota_offset') is not None:
        install_bleota_offset = partitions_offsets['bleota_offset']
        log.debug(f"Using bleota_offset from partitions.bin: 0x{install_bleota_offset:x}")
    else:
        # Fallback: hardcoded values
        if flashsize == '16MB':
            install_bleota_offset = 0x650000
        elif flashsize == '8MB':
            install_bleota_offset = 0x5D0000
        else:
            install_bleota_offset = 0x260000

        if partitions_offsets:  # Parsing was done but bleota_offset not found
            log.debug(f"bleota_offset not found in partitions.bin, using fallback: 0x{install_bleota_offset:x}")

    # install_littlefs_offset: partitions.bin > hardcoded by flash size
    if partitions_offsets and partitions_offsets.get('littlefs_offset') is not None:
        install_littlefs_offset = partitions_offsets['littlefs_offset']
        log.debug(f"Using littlefs_offset from partitions.bin: 0x{install_littlefs_offset:x}")
    else:
        # Fallback: hardcoded values
        if flashsize == '16MB':
            install_littlefs_offset = 0xc90000
        elif flashsize == '8MB':
            install_littlefs_offset = 0x670000
        else:
            install_littlefs_offset = 0x300000

        if partitions_offsets:  # Parsing was done but littlefs_offset not found
            log.debug(f"littlefs_offset not found in partitions.bin, using fallback: 0x{install_littlefs_offset:x}")

    # Update offsets for backward compatibility with existing manifests
    update_offset = 0x10000

    #s3 -v3 t-deck wireless-paper wireless-tracker
    bleotav = 'mt-esp32-ota'

    chip_family = "ESP32"
    if ("s3" in t) or ("-v3" in t) or ("t-deck" in t) or ("wireless-paper" in t) or ("wireless-tracker" in t) or devinfo.get("chip", None) == 'esp32s3':
        chip_family = "ESP32-S3"
        bleotav = 'mt-esp32s3-ota'
    elif ("c3" in t or devinfo.get("chip", None) == 'esp32c3'):
        chip_family = "ESP32-C3"
        bleotav = 'bleota-c3'
    elif ("c6" in t or devinfo.get("chip", None) == 'esp32c6'):
        chip_family = "ESP32-C6"
        bleotav = 'bleota-c3'
    else:  # Need to check nrf52/rp2040 somehow, but this method in most cases no need to invoke for nrf/rp2040
        data = await getAvailableFirmwares()
        if t in data.get('uf2devices'):
            chip_family = "NRF52"
        elif  t in data.get('espdevices'):
            chip_family = "ESP32"
        elif  t in data.get('rp2040devices'):
            chip_family = "RP2040"

    manifest["builds"][0]['flashsize'] = flashsize
    manifest["builds"][0]["chipFamily"] = chip_family
    manifest['pathfw'] = "api/firmware?v={0}&t={1}&u={2}&e=false&src={3}".format(v,t,u,src)
    if chip_family == 'NRF52':
        #manifest['pathfw'] = "api/firmware?v={0}&t={1}&u={2}&e=false".format(v,t,u)
        manifest['pathota'] = "api/firmware?v={0}&t={1}&u=4&e=false&src={3}".format(v,t,u,src) #u=4 for ota
    elif chip_family == 'RP2040':
        #manifest['pathfw'] = "api/firmware?v={0}&t={1}&u={2}&e=false".format(v,t,u)
        pass
    elif u =="1":
        offset= update_offset
        path = "firmware?v={0}&t={1}&u={2}&src={3}".format(v,t,u,src)
        manifest["builds"][0]["parts"].append({ "path": path, "offset": offset })

    else:
        # Build manifest based on firmware type
        if fw_type == FirmwareType.MESHCORE:
            # Meshcore: only firmware part (no OTA/LittleFS)
            pathfw = "firmware?v={0}&t={1}&u={2}&p={3}&src={4}".format(v,t,u,'fw',src)
            manifest["builds"][0]["parts"].append({ "path": pathfw, "offset": install_fw_offset })
        else:
            # Meshtastic: standard manifest with all parts
            pathfw = "firmware?v={0}&t={1}&u={2}&p={3}&src={4}".format(v,t,u,'fw',src)
            pathbleota = "firmware?v={0}&t={1}&u={2}&p={3}&src={4}".format(v,t,u, bleotav,src)
            pathlittlefs = "firmware?v={0}&t={1}&u={2}&p={3}&src={4}".format(v,t,u,'littlefs',src)
            manifest["builds"][0]["parts"].append({ "path": pathfw, "offset": install_fw_offset })
            manifest["builds"][0]["parts"].append({ "path": pathbleota, "offset": install_bleota_offset })
            manifest["builds"][0]["parts"].append({ "path": pathlittlefs, "offset": install_littlefs_offset })

    return manifest

# Инициализация базы MIME-types
mimetypes.init()

async def getMimeType(filename):
    mime_type, _ = mimetypes.guess_type(filename)
    if mime_type:
        return mime_type
    # Fallback для неизвестных типов
    return 'application/octet-stream'

def getClientIp(request: Request) -> str:
    """Extract IP from x-forwarded-for header or request.client.host"""
    forwarded = request.headers.get('x-forwarded-for')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.client.host if request.client else None

async def getIpInfo(ip: str):
    """Get IP geolocation info (country, city) with timeout"""
    if not ip:
        return None

    ipInfoConfig = config.get('ipInfo', {})
    url = ipInfoConfig.get('url')
    timeout = ipInfoConfig.get('timeout')

    if not url:
        return None

    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
            async with session.get(f"{url}/{ip}") as response:
                if response.status == 200:
                    data = await response.json()
                    country = data.get('country_name_official')
                    city = data.get('city')
                    if country or city:
                        return {
                            'country': country,
                            'city': city
                        }
    except Exception as e:
        log.debug(f"Failed to get IP info for {ip}: {e}")

    return None


# Lifespan context manager for startup/shutdown events
@asynccontextmanager
async def lifespan(app: FastAPI):
    global config
    # Startup: Load config and initialize database
    loadConfig()
    # Set app.state after config is loaded
    app.state.config = config
    app.state.log = log
    app.state.templates = templates
    # Initialize news database
    try:
        from apps.news.database import init_db
        await init_db()
        log.info("News database initialized successfully")
    except Exception as e:
        log.warning(f"Failed to initialize news database: {e}")
    yield
    # Shutdown: cleanup if needed


app = FastAPI(lifespan=lifespan)


#app.include_router(router)
app.mount("/static", StaticFiles(directory="static"), name="static")
# Include news router
app.include_router(news_router, tags=["news"])

templates = Jinja2Templates(directory="templates")
general_pages_router = APIRouter()


# Favicon handler - returns 204 No Content to prevent 404 errors
@app.get("/favicon.ico", status_code=204)
async def favicon():
    """Handle favicon requests - return no content"""
    return None


# Page with script
@app.get("/", status_code=200)
async def homepage(request: Request, src:str = None, t:str = None):
    clientIp = getClientIp(request)
    ipInfo = await getIpInfo(clientIp) if clientIp else None

    logMsg = f"Main page builder: {str(request.url)}, {str(request.client)}, {str(request.headers)}"
    if ipInfo:
        logMsg += f", country: {ipInfo.get('country')}, city: {ipInfo.get('city')}"

    log.debug(logMsg)
    return templates.TemplateResponse("general/homepage.html",{"request":request, "data" : await getAvailableFirmwares(src = src, t =t), "defaultDevice" : t})

# availableSRCs
@app.get("/api/srcs", status_code=200)
async def getSources(request: Request):
    clientIp = getClientIp(request)
    ipInfo = await getIpInfo(clientIp) if clientIp else None

    logMsg = f"GetSources: url: {str(request.url)}, client: {str(request.client)}, headers: {str(request.headers)}"
    if ipInfo:
        logMsg += f", country: {ipInfo.get('country')}, city: {ipInfo.get('city')}"

    log.debug(logMsg)
    return JSONResponse(content= await getSrcs())

# availableFirmwares.json
@app.get("/api/availableFirmwares", status_code=200)
async def getAvailableFw(request: Request, src:str = None):
    return JSONResponse(content= await getAvailableFirmwares(src = src))

# Manifest.json
@app.get("/api/manifest", status_code=200)
async def getManifest(request: Request, t:str = None, v:str = None, u:str = "1", src:str = None):
    return JSONResponse(content= await buildManifest(t, v, u, src))

# Infoblock (HTML)
@app.get("/api/infoblock", status_code=200)
async def getInfoblock(request: Request, t:str = None, v:str = None, src:str = None):
    return JSONResponse(content= await buildInfoblock(t,v, src))

# Versions for device
@app.get("/api/versions", status_code=200)
async def getVersions(request: Request, t:str = None, src:str = None):
    return JSONResponse(content= await buildVersions(t=t, src=src))

@app.get("/api/firmware" )
async def download_file(request: Request, t:str = None, v:str = None, u:str = "1", p:str = None, e:bool = True, src = None):
    #u: 5 - zip, 4 - ota, 1 - update, 2 - install
    #check which source folder used
    logInd = True
    rootFolder, src, fw_type = await getRootFolder(t,v,src)

    if not rootFolder:
        return {'error': 'No such firmware found'}

    #return zipped firmware folder
    if u == "5":
        #rf = await getRootFolder(t,v)
        #if not rf:
        #    return JSONResponse(content={'error': 'No such firmware found'}, status_code=404)
        dir = os.path.join(rootFolder,t,v)
        zip_buffer = await generate_zip(dir, await buildManifest(t = t, v = v, u = u, src = src))
        zip_buffer.seek(0, 2)  # Переходим в конец
        zip_size = zip_buffer.tell()  # Получаем размер
        zip_buffer.seek(0)  # Возвращаемся в начало
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
                headers={
                    "Content-Disposition": f"attachment; filename={t}-{v}.zip",
                    "Content-Length": str(zip_size)
                }
        )

    #need additional logic for -s3 and install
    if not e: #not esp32
        if u=="4": #ota
            #path = os.path.join(rootFolder,t,v,"firmware-ota.zip")
            path, filename = await getFileByMask(os.path.join(rootFolder,t,v),r".*\.zip")
            if filename == "firmware-ota.zip":
                filename = t+"-"+v+"-ota.zip"
            #if(not await aiofiles.os.path.isfile(path)):
            #    path = os.path.join(rootFolder,t,v,"firmware.zip")
            #filename = t+"-"+v+"-ota.zip"
        else: #uf2
            #path = os.path.join(rootFolder,t,v,"firmware.uf2")
            #filename = t+"-"+v+".uf2"
            path, filename = await getFileByMask(os.path.join(rootFolder,t,v),r".*\.uf2")
            if filename == "firmware.uf2":
                filename = t+"-"+v+".uf2"

    else :
        if u=="1": #update
            #path = os.path.join(rootFolder,t,v,"firmware.bin")
            #filename = t+"-"+v+".bin"
            if fw_type == FirmwareType.MESHCORE:
                # Meshcore: regular .bin files (not merged)
                path, filename = await getFileByMask(os.path.join(rootFolder,t,v),r"(?!.*merged).*\.bin")
            else:
                # Meshtastic: firmware.bin files (not factory)
                path, filename = await getFileByMask(os.path.join(rootFolder,t,v),r".*firmware(?!.*factory).*\.bin")
            if filename == "firmware.bin":
                filename = t+"-"+v+".bin"
        elif u=="2":  #install
            if p == 'fw':
                if fw_type == FirmwareType.MESHCORE:
                    # Meshcore: merged.bin
                    path, filename = await getFileByMask(os.path.join(rootFolder,t,v),r".*merged\.bin")
                else:
                    # Meshtastic: firmware.*factory.bin
                    path, filename = await getFileByMask(os.path.join(rootFolder,t,v),r".*firmware.*factory\.bin")
                    if filename == "firmware.factory.bin":
                        filename = t+"-"+v+".factory.bin"
            if p == 'littlefs':
                logInd = False # Do not log additional files downloads
                #path = os.path.join(rootFolder,t,v,"littlefs.bin")
                #filename = "littlefs.bin"
                path, filename = await getFileByMask(os.path.join(rootFolder,t,v),r".*littlefs.*\.bin")
            if 'bleota' in p:
                logInd = False # Do not log additional files downloads
                if '-s3' in p: # possible need different ota for c3
                    path = "bin/bleota-s3.bin"
                    filename = "bleota-s3.bin"
                else:
                    path = "bin/bleota.bin"
                    filename = "bleota.bin"
    if logInd:
        clientIp = getClientIp(request)
        ipInfo = await getIpInfo(clientIp) if clientIp else None

        logMsg = f"DownloadFile: type: {t}, version: {v}, path: {path}, filename: {filename}, url: {str(request.url)}, client: {str(request.client)}, headers: {str(request.headers)}"
        if ipInfo:
            logMsg += f", country: {ipInfo.get('country')}, city: {ipInfo.get('city')}"

        log.info(logMsg)
    return FileResponse(path=path, filename=filename, media_type=await getMimeType(path))


def unirun():
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info", root_path="/")


if __name__ == "__main__":


    t2 = Thread(target=unirun)
    t2.daemon = True
    t2.start()

    t2.join()
