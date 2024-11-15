import json
import yaml

from jsonmerge import merge
import utils.logger

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

import uvicorn

from threading import Thread
from fastapi import APIRouter
from fastapi import Request
from fastapi.responses import FileResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles 

import aiofiles
import aiofiles.ospath
import aiofiles.os
import os
import re
import markdown
from pathlib import Path
from distutils.version import LooseVersion


class CustomLooseVersion(LooseVersion):
    def parse(self, vstring):
        # I've given up on thinking I can reconstruct the version string
        # from the parsed tuple -- so I just store the string here for
        # use by __str__
        self.vstring = vstring
        components = re.split('[\. ]',vstring)
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
        for i in range(len(self.version)):
            try:
                if type(self.version[i]) != type(other.version[i]):
                    self.version[i] = str(self.version[i])
                    other.version[i] = str(other.version[i])
            except Exception as e:
                pass
        
        if "daily" in self.vstring and "daily" not in other.vstring:
            return 1
        if "daily" not in self.vstring and "daily" in other.vstring:
            return -1

        if self.version == other.version:
            return 0
        if self.version < other.version:
            return -1
        if self.version > other.version:
            return 1



#period_pattern = re.compile("^\d{4}-\d{1,2}$")
fwfiles = None

log = utils.logger.getLogger()
DEBUG2 =5

config={}

aiofiles.os.walk = aiofiles.os.wrap(os.walk)

def loadConfig():

    global config
    with open('config/config.yml', 'r') as f:
        cfg = yaml.safe_load(f)
        
        base = cfg['base']
        diff = cfg['enviroments'][cfg['enviroment']]
        base = base if base else {}
        diff = diff if diff else {}
        config = merge(base, diff)




def init():
    pass

hidden_regex = re.compile(r"^_.*")  

async def getAvailibleFirmwares():
    data = {"espdevices":[], "uf2devices":[], "rp2040devices":[], "versions":[]}

    uf2files_pattern = re.compile(".*\.uf2")
    otafiles_pattern = re.compile(".*\.zip")

    
    # Builds output folders with pattern 'device'/'version'
    #rootFolder = "data2/" 

    uf2devices = set()
    espdevices = set()
    rp2040devices = set()
    versions = set()
    
    for rootFolder in config['fwDirs']:
        address_pattern = re.compile("^"+rootFolder+"[^/]+$")  
        for address, dirs, files in await aiofiles.os.walk(rootFolder, topdown=True, onerror=None, followlinks=False):
            if address == rootFolder:
                pass            
            if bool(address_pattern.match(address)):
                if bool(hidden_regex.match(Path(address).name)):
                    log.info(f"Skipping device {Path(address).name} - marked as hidden")
                    continue
                # Remove hidden versions
                versions = versions.union(set([d for d in dirs if not bool(hidden_regex.match(d))]))
                for d in dirs:
                    files = await aiofiles.os.scandir(address+"/"+d)
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
    data["versions"] = list(set(data["versions"]).union(versions))

    data["espdevices"].sort()
    data["uf2devices"].sort()
    data["rp2040devices"].sort()
    

    data["versions"].sort(reverse=True, key=CustomLooseVersion)


    return data

async def buildInfoblock(t:str = None, v:str = None):
    infoblock={'info':""}
    rmfile = "readme.md"
    
    for rootFolder in config['fwDirs']:
        if(await aiofiles.os.path.isfile(rootFolder+t+"/"+rmfile)):
            rmfile = rootFolder+t+'/'+rmfile
            break
    
    try:
        async with aiofiles.open(rmfile,'r') as file:
            content = await file.read()
        html = markdown.markdown(content)
        infoblock['info'] = html
    except Exception as e:
        log.info("readme.md file not found")
        infoblock['info'] = "Readme.md file not found in variant repository"
    return infoblock

async def buildVersions(t:str = None):
    data = {"versions":[]}
    versions_map = {}
    dates_map = {}
    latestTags = {}

    for rootFolder in config['fwDirs']:
        address_pattern = re.compile("^"+rootFolder+"[^/]+$")
        reg = r"^(?P<mver>([\w\d]+\.){2}([\w\d]+))\.(?P<n>[\w\d]+)\.*(?P<daily>daily)*$"

        for address, dirs, files in await aiofiles.os.walk(rootFolder+t, topdown=True, onerror=None, followlinks=False):
            if address == rootFolder:
                dataDirs = dirs
            if bool(address_pattern.match(address)):
                for d in dirs:
                    if bool(hidden_regex.match(d)):
                        log.info(f"Skipping version '{d}' - marked as hidden")
                        continue
                    files = await aiofiles.os.scandir(address+"/"+d)
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
                                    
                            sver = f"{matches.group('mver')} {jver.get('date')} {matches.group('daily')}"
                            versions_map[sver] = jver.get('version')
                            dates_map[jver.get('version')] = jver.get('date')
                                    #data.get('versions',[]).append(sver) 
                    else:
                                #reg = r"^(?P<mver>([\w\d]+\.){2}([\w\d]+))\.(?P<n>[\w\d]+)\.*(?P<daily>daily)*$"
                        matches= re.search(reg, d)
                        sver = f"{matches.group('mver')} 00:00:00 {matches.group('daily')}"
                        versions_map[sver] = d
                                #data.get('versions',[]).append(sver)    

    versorted = list(versions_map.keys())
    versorted.sort(reverse=True, key=CustomLooseVersion)
    data["versions"] = [versions_map.get(v) for v in versorted] + data["versions"]
    # Remove possible dublicates
    data["versions"] = list(dict.fromkeys(data["versions"]))
    data["dates"] = dates_map
    data["latestTags"] = latestTags

    #data["versions"] = list(set(data["versions"]))
    #data["versions"].sort(reverse=True, key=CustomLooseVersion)

    return data


async def buildManifest(t:str = None, v:str = None, u:str = "1"):
    log.debug("Build manifest: %s, %s",t,v)
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
    update_offset = 65536
    install_fw_offset = 0
    install_bleota_offset = 2490368
    install_littlefs_offset = 3145728
    #s3 -v3 t-deck wireless-paper wireless-tracker 
    bleotav = 'bleota'
    
    chip_family = "ESP32"
    if ("s3" in t) or ("-v3" in t) or ("t-deck" in t) or ("wireless-paper" in t) or ("wireless-tracker" in t):
        chip_family = "ESP32-S3"
        bleotav = 'bleota-s3'
    elif ("c3" in t):
        chip_family = "ESP32-C3"
    else:  # Need to check nrf52/rp2040 somehow
        data = await getAvailibleFirmwares()
        if t in data.get('uf2devices'):
            chip_family = "NRF52"
        elif  t in data.get('espdevices'):
            chip_family = "ESP32"
        elif  t in data.get('rp2040devices'):
            chip_family = "RP2040"

    manifest["builds"][0]["chipFamily"] = chip_family
    if chip_family == 'NRF52':
        manifest['pathfw'] = "api/firmware?v={0}&t={1}&u={2}&e=false".format(v,t,u)
        manifest['pathota'] = "api/firmware?v={0}&t={1}&u=4&e=false".format(v,t,u) #u=4 for ota
    elif chip_family == 'RP2040':
        manifest['pathfw'] = "api/firmware?v={0}&t={1}&u={2}&e=false".format(v,t,u)
    elif u =="1":
        offset= update_offset
        path = "firmware?v={0}&t={1}&u={2}".format(v,t,u)
        manifest["builds"][0]["parts"].append({ "path": path, "offset": offset })
        
    else:

        pathfw = "firmware?v={0}&t={1}&u={2}&p={3}".format(v,t,u,'fw')
        pathbleota = "firmware?v={0}&t={1}&u={2}&p={3}".format(v,t,u, bleotav)
        pathlittlefs = "firmware?v={0}&t={1}&u={2}&p={3}".format(v,t,u,'littlefs')
        manifest["builds"][0]["parts"].append({ "path": pathfw, "offset": install_fw_offset })
        manifest["builds"][0]["parts"].append({ "path": pathbleota, "offset": install_bleota_offset })
        manifest["builds"][0]["parts"].append({ "path": pathlittlefs, "offset": install_littlefs_offset })

    return manifest



app = FastAPI()


#app.include_router(router)
app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")
general_pages_router = APIRouter()


# Page with script
@app.get("/", status_code=200)
async def homepage(request: Request):
    log.debug("Main page builder: %s, %s, %s", str(request.url), str(request.client), str(request.headers))
    return templates.TemplateResponse("general/homepage.html",{"request":request, "data" : await getAvailibleFirmwares()})

# Manifest.json
@app.get("/api/manifest", status_code=200)
async def getSources(request: Request, t:str = None, v:str = None, u:str = "1"):
    return JSONResponse(content= await buildManifest(t, v, u))

# Infoblock (HTML)
@app.get("/api/infoblock", status_code=200)
async def getSources(request: Request, t:str = None, v:str = 'current'):
    return JSONResponse(content= await buildInfoblock(t,v))

# Versions for device
@app.get("/api/versions", status_code=200)
async def getSources(request: Request, t:str = None):
    return JSONResponse(content= await buildVersions(t))

@app.get("/api/firmware" )
async def download_file(request: Request, t:str = None, v:str = None, u:str = "1", p:str = None, e:bool = True):
    
    #check which source folder used
    rootFolder = ''
    for rf in config['fwDirs']:
        if(await aiofiles.os.path.isdir(rf+t+"/"+v)):
            rootFolder = rf
            break
    
    #need additional logic for -s3 and install
    if not e: #not esp32
        if u=="4": #ota
            path = rootFolder+f"{t}/{v}/firmware-ota.zip"
            if(not await aiofiles.os.path.isfile(path)):
                path = rootFolder+f"{t}/{v}/firmware.zip"
            filename = t+"-"+v+"-ota.zip"
        else: #uf2
            path = rootFolder+f"{t}/{v}/firmware.uf2"
            filename = t+"-"+v+".uf2"
            
    else :
        if u=="1": #update
            path = rootFolder+f"{t}/{v}/firmware.bin"
            filename = t+"-"+v+".bin"
        elif u=="2":  #install
            if p == 'fw':
                path = rootFolder+f"{t}/{v}/firmware.factory.bin"
                filename = t+"-"+v+".factory.bin"
            if p == 'littlefs':
                path = rootFolder+f"{t}/{v}/littlefs.bin"
                filename = "littlefs.bin"
            if 'bleota' in p:
                if '-s3' in p: # possible need different ota for c3
                    path = "bin/bleota-s3.bin"
                    filename = "bleota-s3.bin"
                else:
                    path = "bin/bleota.bin"
                    filename = "bleota.bin"
    return FileResponse(path=path, filename=filename, media_type='multipart/form-data')


def unirun():
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info", root_path="/flasher")


#Loading config
loadConfig()
init()



if __name__ == "__main__":
    

    t2 = Thread(target=unirun)
    t2.isDaemon =True
    t2.start()

    t2.join()
