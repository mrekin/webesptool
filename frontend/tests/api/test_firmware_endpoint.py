#!/usr/bin/env python3
"""
Test script for /api/firmware endpoint.

Tests firmware file downloads for ESP and NRF52/RP2040 devices.
For ESP: uses manifests to get firmware paths.
For NRF52/RP2040: downloads firmware and OTA files directly.
Computes and stores file metadata (name, size, md5) in baseline.
Downloads are deleted after verification to save disk space.
"""

import json
import asyncio
import os
import sys
import tempfile
import hashlib
import time
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime

import aiohttp


# Server environments
SERVERS = {
    "prod": {
        "name": "Production (Cloudflare)",
        "url": "https://mrekin.duckdns.org/flasher",
        "baseline_file": "api_firmware_baseline_prod.json"
    },
    "prod_local": {
        "name": "Production Local",
        "url": "http://192.168.1.115:5550",
        "baseline_file": "api_firmware_baseline_prod_local.json"
    },
    "test": {
        "name": "Test",
        "url": "http://192.168.1.115:5551",
        "baseline_file": "api_firmware_baseline_test.json"
    }
}

SRC = "Official repo"
MAX_CONCURRENT = 10  # Maximum concurrent downloads


def select_environment() -> str:
    """Select server environment from command line or user input."""
    # Check if -e argument provided
    if len(sys.argv) > 1:
        for i, arg in enumerate(sys.argv[1:], 1):
            if arg == "-e" and i + 1 < len(sys.argv):
                env = sys.argv[i + 1]
                if env in SERVERS:
                    return env
                else:
                    print(f"Error: Unknown environment '{env}'")
                    print(f"Available environments: {', '.join(SERVERS.keys())}")
                    sys.exit(1)

    # Interactive selection
    print("Select server environment:")
    for i, (key, config) in enumerate(SERVERS.items(), 1):
        print(f"  {i}. {key}: {config['name']} ({config['url']})")

    while True:
        try:
            choice = input("\nEnter choice (1-3): ").strip()
            options = list(SERVERS.keys())
            if choice.isdigit() and 1 <= int(choice) <= len(options):
                return options[int(choice) - 1]
            else:
                env = choice.lower()
                if env in options:
                    return env
                print(f"Invalid choice. Please enter 1-{len(options)} or environment name.")
        except (EOFError, KeyboardInterrupt):
            print("\nExiting...")
            sys.exit(0)


class FirmwareTester:
    def __init__(self, base_url: str, baseline_file: Path):
        self.base_url = base_url
        self.baseline_file = baseline_file
        self.baseline: Dict[str, Any] = {}
        self.test_cases: List[Dict[str, Any]] = []
        self.results = {
            "passed": 0,
            "failed": 0,
            "errors": [],
            "differences": []
        }
        self._lock = asyncio.Lock()  # For thread-safe results updates
        self.metrics = {
            "total_download_time": 0,
            "total_md5_time": 0,
            "total_manifest_time": 0,
            "download_count": 0
        }

    def load_baseline(self) -> bool:
        """Load baseline data from file. Returns True if file exists."""
        if self.baseline_file.exists():
            with open(self.baseline_file, 'r') as f:
                self.baseline = json.load(f)
            return True
        return False

    def save_baseline(self):
        """Save baseline data to file."""
        baseline_files = self.baseline.get("baseline_files", {})
        devices = set()
        for file_data in baseline_files.values():
            devices.add(file_data.get("device"))

        baseline_data = {
            "metadata": {
                "created": datetime.now().isoformat(),
                "total_files": len(baseline_files),
                "total_devices": len(devices)
            },
            "baseline_files": baseline_files
        }
        with open(self.baseline_file, 'w') as f:
            json.dump(baseline_data, f, indent=2)

    async def fetch_available_firmwares(self, session: aiohttp.ClientSession) -> Dict:
        """Fetch available devices from /api/availableFirmwares."""
        url = f"{self.base_url}/api/availableFirmwares"
        params = {"src": SRC}
        async with session.get(url, params=params) as response:
            response.raise_for_status()
            return await response.json()

    async def fetch_versions(self, session: aiohttp.ClientSession, device: str) -> List[str]:
        """Fetch versions for a device from /api/versions."""
        url = f"{self.base_url}/api/versions"
        params = {"t": device, "src": SRC}
        async with session.get(url, params=params) as response:
            response.raise_for_status()
            data = await response.json()
            versions = data.get("versions", [])
            # Filter out daily versions
            stable_versions = [v for v in versions if "daily" not in v.lower()]
            return stable_versions[:2]  # Take up to 2 latest stable versions

    async def fetch_manifest(self, session: aiohttp.ClientSession,
                           device: str, version: str, u: str) -> Dict:
        """Fetch manifest from /api/manifest."""
        start = time.time()
        url = f"{self.base_url}/api/manifest"
        params = {
            "t": device,
            "v": version,
            "u": u,
            "src": SRC
        }
        async with session.get(url, params=params) as response:
            response.raise_for_status()
            result = await response.json()
            elapsed = time.time() - start
            async with self._lock:
                self.metrics["total_manifest_time"] += elapsed
            return result

    def select_test_devices(self, firmware_data: Dict) -> List[Dict]:
        """Select 50 devices (30 ESP + 20 NRF52/RP2040)."""
        esp_devices = firmware_data.get("espdevices", [])
        uf2_devices = firmware_data.get("uf2devices", [])
        rp2040_devices = firmware_data.get("rp2040devices", [])

        selected = []

        # Take 30 ESP devices
        esp_count = min(30, len(esp_devices))
        selected.extend([{"device": d, "type": "esp"} for d in esp_devices[:esp_count]])

        # Fill up to 50 from NRF52/RP2040
        remaining = 50 - len(selected)

        # Add from uf2devices (NRF52)
        uf2_count = min(remaining, len(uf2_devices))
        selected.extend([{"device": d, "type": "nrf52"} for d in uf2_devices[:uf2_count]])
        remaining -= uf2_count

        # Add from rp2040devices if still need more
        if remaining > 0:
            rp2040_count = min(remaining, len(rp2040_devices))
            selected.extend([{"device": d, "type": "rp2040"} for d in rp2040_devices[:rp2040_count]])

        return selected

    async def download_firmware(
        self,
        session: aiohttp.ClientSession,
        path: str,
        output_path: Path
    ) -> bool:
        """Download firmware file to output_path."""
        start = time.time()
        # Ensure path starts with api/ for correct endpoint
        if not path.startswith("api/"):
            path = f"api/{path}"
        url = f"{self.base_url}/{path}"
        try:
            async with session.get(url) as response:
                response.raise_for_status()
                with open(output_path, 'wb') as f:
                    async for chunk in response.content.iter_chunked(8192):
                        f.write(chunk)
                elapsed = time.time() - start
                async with self._lock:
                    self.metrics["total_download_time"] += elapsed
                    self.metrics["download_count"] += 1
                return True
        except Exception as e:
            return False

    def compute_md5(self, file_path: Path) -> str:
        """Compute MD5 hash of file."""
        start = time.time()
        md5_hash = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(4096), b""):
                md5_hash.update(chunk)
        elapsed = time.time() - start
        # Store metric (synchronous, no lock needed in this context)
        self._md5_time = elapsed
        return md5_hash.hexdigest()

    async def create_baseline(self):
        """Create initial baseline by downloading all firmware files."""
        print("Creating firmware baseline data...")

        async with aiohttp.ClientSession() as session:
            # Fetch available devices
            print("Fetching available devices...")
            firmware_data = await self.fetch_available_firmwares(session)
            selected_devices = self.select_test_devices(firmware_data)
            print(f"Selected {len(selected_devices)} devices for testing")

            baseline_files = {}
            temp_dir = Path(tempfile.mkdtemp(prefix="firmware_test_"))
            semaphore = asyncio.Semaphore(MAX_CONCURRENT)
            import uuid

            try:
                # Create tasks for all device/version combinations
                tasks = []
                for device_info in selected_devices:
                    device = device_info["device"]
                    dev_type = device_info["type"]
                    task_id = uuid.uuid4().hex[:8]

                    async def process_device(dev=device, dev_type=dev_type, tid=task_id):
                        async with semaphore:
                            print(f"Processing {dev} ({dev_type}) [{tid}]...")
                            try:
                                versions = await self.fetch_versions(session, dev)
                                if not versions:
                                    print(f"  {dev}: No stable versions found, skipping")
                                    return

                                print(f"  {dev}: Found {len(versions)} version(s): {versions}")

                                for version in versions:
                                    if dev_type == "esp":
                                        await self._process_esp_device(
                                            session, dev, version, temp_dir, baseline_files, tid
                                        )
                                    else:
                                        await self._process_uf2_device(
                                            session, dev, version, temp_dir, baseline_files, tid
                                        )

                            except Exception as e:
                                async with self._lock:
                                    self.results["failed"] += 1
                                    self.results["errors"].append(f"{dev}: {str(e)}")
                                print(f"  {dev}: Error - {e}")

                    tasks.append(process_device())

                # Run all tasks concurrently
                await asyncio.gather(*tasks)

            finally:
                # Clean up temp directory
                if temp_dir.exists():
                    temp_dir.rmdir()

        self.baseline["baseline_files"] = baseline_files
        self.save_baseline()

        print(f"\nBaseline created successfully!")
        print(f"  Files: {len(baseline_files)}")
        print(f"  Passed: {self.results['passed']}")
        print(f"  Failed: {self.results['failed']}")

    async def _process_esp_device(
        self, session: aiohttp.ClientSession,
        device: str, version: str, temp_dir: Path,
        baseline_files: Dict, task_id: str = ""
    ):
        """Process ESP device: get manifests and download firmware files."""
        for u in ["1", "2"]:
            try:
                manifest = await self.fetch_manifest(session, device, version, u)

                for build in manifest.get("builds", []):
                    for part_idx, part in enumerate(build.get("parts", [])):
                        path = part.get("path")
                        if not path:
                            continue

                        # Extract parameters for naming
                        from urllib.parse import urlparse, parse_qs
                        parsed = urlparse(f"/{path}")
                        params = parse_qs(parsed.query)
                        p_param = params.get('p', [None])[0]

                        # Create filename (with task_id suffix for uniqueness)
                        suffix = f"_{task_id}" if task_id else ""
                        if p_param:
                            filename = f"{device}_{version}_u{u}_{p_param}{suffix}.bin"
                        else:
                            filename = f"{device}_{version}_u{u}{suffix}.bin"

                        file_key = f"{device}_{version}_u{u}"
                        if p_param:
                            file_key += f"_{p_param}"

                        print(f"    {device}: Downloading {filename}...")
                        temp_path = temp_dir / filename

                        success = await self.download_firmware(session, path, temp_path)
                        if not success:
                            async with self._lock:
                                self.results["failed"] += 1
                                self.results["errors"].append(f"{file_key}: Failed to download")
                            print(f"      ✗ Failed")
                            continue

                        # Compute metadata
                        size = temp_path.stat().st_size
                        md5 = self.compute_md5(temp_path)
                        async with self._lock:
                            self.metrics["total_md5_time"] += self._md5_time

                        # Use clean filename without task_id for baseline
                        clean_filename = filename.replace(suffix, "") if suffix else filename
                        baseline_files[file_key] = {
                            "filename": clean_filename,
                            "size": size,
                            "md5": md5,
                            "path": path,
                            "device": device,
                            "version": version,
                            "u": u,
                            "p": p_param,
                            "offset": part.get("offset"),
                            "type": "esp"
                        }

                        # Delete temp file
                        temp_path.unlink()
                        async with self._lock:
                            self.results["passed"] += 1
                        print(f"      ✓ ({size} bytes)")

            except Exception as e:
                print(f"    Error for u={u}: {e}")

    async def _process_uf2_device(
        self, session: aiohttp.ClientSession,
        device: str, version: str, temp_dir: Path,
        baseline_files: Dict, task_id: str = ""
    ):
        """Process NRF52/RP2040 device: download uf2 and ota files directly."""
        # Download firmware (uf2)
        fw_key = f"{device}_{version}_uf2"
        suffix = f"_{task_id}" if task_id else ""
        fw_filename = f"{device}_{version}{suffix}.uf2"
        fw_path = temp_dir / fw_filename

        print(f"    {device}: Downloading {fw_filename}...")
        success = await self._download_uf2_firmware(
            session, device, version, fw_path
        )

        if success:
            size = fw_path.stat().st_size
            md5 = self.compute_md5(fw_path)
            async with self._lock:
                self.metrics["total_md5_time"] += self._md5_time

            # Use clean filename without task_id for baseline
            clean_fw_filename = fw_filename.replace(suffix, "") if suffix else fw_filename
            baseline_files[fw_key] = {
                "filename": clean_fw_filename,
                "size": size,
                "md5": md5,
                "device": device,
                "version": version,
                "u": "1",
                "p": "uf2",
                "type": "uf2"
            }

            fw_path.unlink()
            async with self._lock:
                self.results["passed"] += 1
            print(f"      ✓ ({size} bytes)")
        else:
            async with self._lock:
                self.results["failed"] += 1
                self.results["errors"].append(f"{fw_key}: Failed to download")
            print(f"      ✗ Failed")
            return

        # Download OTA (zip)
        ota_key = f"{device}_{version}_ota"
        ota_filename = f"{device}_{version}{suffix}-ota.zip"
        ota_path = temp_dir / ota_filename

        print(f"    {device}: Downloading {ota_filename}...")
        success = await self._download_ota_file(
            session, device, version, ota_path
        )

        if success:
            size = ota_path.stat().st_size
            md5 = self.compute_md5(ota_path)
            async with self._lock:
                self.metrics["total_md5_time"] += self._md5_time

            # Use clean filename without task_id for baseline
            clean_ota_filename = ota_filename.replace(suffix, "") if suffix else ota_filename
            baseline_files[ota_key] = {
                "filename": clean_ota_filename,
                "size": size,
                "md5": md5,
                "device": device,
                "version": version,
                "u": "4",
                "p": "ota",
                "type": "uf2"
            }

            ota_path.unlink()
            async with self._lock:
                self.results["passed"] += 1
            print(f"      ✓ ({size} bytes)")
        else:
            async with self._lock:
                self.results["failed"] += 1
                self.results["errors"].append(f"{ota_key}: Failed to download")
            print(f"      ✗ Failed")

    async def _download_uf2_firmware(
        self, session: aiohttp.ClientSession,
        device: str, version: str, output_path: Path
    ) -> bool:
        """Download UF2 firmware file."""
        path = f"api/firmware?t={device}&v={version}&u=1&p=uf2&e=false&src={SRC}"
        return await self.download_firmware(session, path, output_path)

    async def _download_ota_file(
        self, session: aiohttp.ClientSession,
        device: str, version: str, output_path: Path
    ) -> bool:
        """Download OTA zip file."""
        path = f"api/firmware?t={device}&v={version}&u=4&p=ota&e=false&src={SRC}"
        return await self.download_firmware(session, path, output_path)

    async def run_tests(self):
        """Run tests against existing baseline."""
        print(f"Loading baseline from {self.baseline_file}...")
        if not self.load_baseline():
            print("No baseline found. Creating new baseline...")
            await self.create_baseline()
            return

        baseline_files = self.baseline.get("baseline_files", {})
        print(f"Loaded {len(baseline_files)} files from baseline\n")

        temp_dir = Path(tempfile.mkdtemp(prefix="firmware_test_"))
        semaphore = asyncio.Semaphore(MAX_CONCURRENT)
        completed = 0

        try:
            async with aiohttp.ClientSession() as session:
                async def test_file(file_key: str, baseline_data: Dict):
                    nonlocal completed
                    async with semaphore:
                        completed += 1
                        print(f"[{completed}/{len(baseline_files)}] Testing {file_key}...")

                        try:
                            # Determine download path based on type
                            if baseline_data.get("type") == "esp":
                                # ESP: use path from manifest
                                path = baseline_data.get("path")
                            else:
                                # UF2: construct path directly
                                device = baseline_data.get("device")
                                version = baseline_data.get("version")
                                p = baseline_data.get("p")

                                if p == "uf2":
                                    path = f"api/firmware?t={device}&v={version}&u=1&p=uf2&e=false&src={SRC}"
                                elif p == "ota":
                                    path = f"api/firmware?t={device}&v={version}&u=4&p=ota&e=false&src={SRC}"
                                else:
                                    raise ValueError(f"Unknown p value: {p}")

                            if not path:
                                async with self._lock:
                                    self.results["failed"] += 1
                                    self.results["errors"].append(f"{file_key}: No path in baseline")
                                print(f"  ✗ No path in baseline")
                                return

                            # Download file
                            filename = baseline_data.get("filename")
                            temp_path = temp_dir / filename

                            success = await self.download_firmware(session, path, temp_path)

                            if not success:
                                async with self._lock:
                                    self.results["failed"] += 1
                                    self.results["errors"].append(f"{file_key}: Failed to download")
                                print(f"  ✗ Download failed")
                                return

                            # Compute current metadata
                            current_size = temp_path.stat().st_size
                            current_md5 = self.compute_md5(temp_path)
                            async with self._lock:
                                self.metrics["total_md5_time"] += self._md5_time

                            # Compare with baseline
                            baseline_size = baseline_data.get("size")
                            baseline_md5 = baseline_data.get("md5")

                            differences = []
                            if current_size != baseline_size:
                                differences.append(
                                    f"Size differs: baseline={baseline_size}, current={current_size}"
                                )

                            if current_md5 != baseline_md5:
                                differences.append(
                                    f"MD5 differs: baseline={baseline_md5[:16]}..., current={current_md5[:16]}..."
                                )

                            # Delete temp file
                            if temp_path.exists():
                                temp_path.unlink()

                            if differences:
                                async with self._lock:
                                    self.results["failed"] += 1
                                    self.results["differences"].append({
                                        "key": file_key,
                                        "differences": differences
                                    })
                                print(f"  ✗ DIFFERS")
                                for diff in differences:
                                    print(f"    {diff}")
                            else:
                                async with self._lock:
                                    self.results["passed"] += 1
                                print(f"  ✓ matches ({current_size} bytes)")

                        except Exception as e:
                            async with self._lock:
                                self.results["failed"] += 1
                                self.results["errors"].append(f"{file_key}: {str(e)}")
                            print(f"  ✗ ERROR - {e}")

                # Create all tasks
                tasks = [
                    test_file(file_key, baseline_data)
                    for file_key, baseline_data in baseline_files.items()
                ]

                # Run all tasks concurrently
                await asyncio.gather(*tasks)

        finally:
            # Clean up temp directory
            if temp_dir.exists():
                temp_dir.rmdir()

    def print_metrics(self):
        """Print performance metrics."""
        m = self.metrics
        download_count = m.get("download_count", 0)

        if download_count == 0:
            return

        total_download = m.get("total_download_time", 0)
        total_md5 = m.get("total_md5_time", 0)
        total_manifest = m.get("total_manifest_time", 0)

        print(f"\n{'='*60}")
        print(f"Performance Metrics:")
        print(f"  Downloads: {download_count}")
        print(f"  Total download time: {total_download:.2f}s")
        print(f"  Avg download time: {total_download/download_count:.3f}s")
        print(f"  Total MD5 time: {total_md5:.2f}s")
        print(f"  Avg MD5 time: {total_md5/download_count:.3f}s")
        print(f"  Total manifest time: {total_manifest:.2f}s")
        print(f"  Total overhead: {total_manifest:.2f}s")
        print(f"{'='*60}")

    def print_summary(self):
        """Print test summary."""
        total = self.results["passed"] + self.results["failed"]
        print(f"\n{'='*60}")
        print(f"Summary:")
        print(f"  Total: {total}")
        print(f"  Passed: {self.results['passed']}")
        print(f"  Failed: {self.results['failed']}")
        print(f"  Errors: {len(self.results['errors'])}")

        if self.results["errors"]:
            print(f"\nErrors:")
            for error in self.results["errors"]:
                print(f"  - {error}")

        self.print_metrics()

        print(f"{'='*60}")


async def main():
    """Main entry point."""
    # Select environment
    env = select_environment()
    config = SERVERS[env]

    base_url = config["url"]
    baseline_file = Path(__file__).parent / config["baseline_file"]

    print(f"Testing /api/firmware endpoint")
    print(f"Environment: {env} - {config['name']}")
    print(f"Base URL: {base_url}")
    print(f"Baseline file: {baseline_file}")
    print()

    tester = FirmwareTester(base_url, baseline_file)
    await tester.run_tests()
    tester.print_summary()


if __name__ == "__main__":
    asyncio.run(main())
