#!/usr/bin/env python3
"""
Test script for /api/manifest endpoint.

Tests manifest endpoint responses for multiple devices and versions.
Stores baseline responses and compares on subsequent runs.
"""

import json
import asyncio
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional
from datetime import datetime

import aiohttp


# Server environments
SERVERS = {
    "prod": {
        "name": "Production (Cloudflare)",
        "url": "https://mrekin.duckdns.org/flasher",
        "baseline_file": "manifest_baseline_prod.json"
    },
    "prod_local": {
        "name": "Production Local",
        "url": "http://192.168.1.115:5550",
        "baseline_file": "manifest_baseline_prod_local.json"
    },
    "test": {
        "name": "Test",
        "url": "http://192.168.1.115:5551",
        "baseline_file": "manifest_baseline_test.json"
    }
}

SRC = "Official repo"


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


class ManifestTester:
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

    def load_baseline(self) -> bool:
        """Load baseline data from file. Returns True if file exists."""
        if self.baseline_file.exists():
            with open(self.baseline_file, 'r') as f:
                self.baseline = json.load(f)
            self.test_cases = self.baseline.get("test_cases", [])
            return True
        return False

    def save_baseline(self):
        """Save baseline data to file."""
        baseline_data = {
            "metadata": {
                "created": datetime.now().isoformat(),
                "total_devices": len(self.test_cases),
                "total_test_cases": sum(len(tc["versions"]) for tc in self.test_cases)
            },
            "test_cases": self.test_cases,
            "baseline_responses": self.baseline.get("baseline_responses", {})
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
        url = f"{self.base_url}/api/manifest"
        params = {
            "t": device,
            "v": version,
            "u": u,
            "src": SRC
        }
        async with session.get(url, params=params) as response:
            response.raise_for_status()
            return await response.json()

    def select_test_devices(self, firmware_data: Dict) -> List[Dict]:
        """Select 30 ESP devices for manifest testing.

        Manifest endpoint is only relevant for ESP devices.
        NRF52 and RP2040 devices don't use manifests.
        """
        esp_devices = firmware_data.get("espdevices", [])

        # Take up to 30 ESP devices
        selected = [{"device": d, "type": "esp32"} for d in esp_devices[:30]]

        return selected

    async def create_baseline(self):
        """Create initial baseline by fetching all devices and versions."""
        print("Creating baseline data...")
        async with aiohttp.ClientSession() as session:
            # Fetch available devices
            print("Fetching available devices...")
            firmware_data = await self.fetch_available_firmwares(session)
            selected_devices = self.select_test_devices(firmware_data)
            print(f"Selected {len(selected_devices)} devices for testing")

            # For each device, get versions and fetch manifests
            self.test_cases = []
            baseline_responses = {}

            for i, device_info in enumerate(selected_devices, 1):
                device = device_info["device"]
                print(f"[{i}/{len(selected_devices)}] Fetching versions for {device}...")

                try:
                    versions = await self.fetch_versions(session, device)
                    if not versions:
                        print(f"  No stable versions found for {device}, skipping")
                        continue

                    print(f"  Found {len(versions)} stable version(s): {versions}")
                    self.test_cases.append({
                        "device": device,
                        "type": device_info["type"],
                        "versions": versions
                    })

                    # Fetch manifests for each version and u value
                    # u=1 (update) and u=2 (install) are supported
                    for version in versions:
                        for u in ["1", "2"]:
                            key = f"{device}_{version}_u{u}"
                            try:
                                print(f"    Fetching manifest for {version} (u={u})...")
                                manifest = await self.fetch_manifest(session, device, version, u)
                                baseline_responses[key] = manifest
                            except Exception as e:
                                print(f"    Error fetching manifest: {e}")

                except Exception as e:
                    print(f"  Error processing {device}: {e}")

            self.baseline["baseline_responses"] = baseline_responses
            self.save_baseline()

        total_tests = sum(len(tc["versions"]) for tc in self.test_cases) * 2  # 2 values of u
        print(f"\nBaseline created successfully!")
        print(f"  Devices: {len(self.test_cases)}")
        print(f"  Total test cases: {total_tests}")

    def compare_dicts(self, dict1: Dict, dict2: Dict, path: str = "") -> List[str]:
        """Compare two dictionaries and return list of differences."""
        differences = []

        for key in set(list(dict1.keys()) + list(dict2.keys())):
            current_path = f"{path}.{key}" if path else key

            if key not in dict1:
                differences.append(f"Missing in current: {current_path}")
            elif key not in dict2:
                differences.append(f"Missing in baseline: {current_path}")
            elif isinstance(dict1[key], dict) and isinstance(dict2[key], dict):
                differences.extend(self.compare_dicts(dict1[key], dict2[key], current_path))
            elif isinstance(dict1[key], list) and isinstance(dict2[key], list):
                if dict1[key] != dict2[key]:
                    # Detailed array comparison
                    differences.extend(self._compare_lists(dict1[key], dict2[key], current_path))
            elif dict1[key] != dict2[key]:
                differences.append(f"Value differs: {current_path} (baseline: {dict2[key]}, current: {dict1[key]})")

        return differences

    def _compare_lists(self, list1: List, list2: List, path: str) -> List[str]:
        """Compare two lists and return detailed differences."""
        differences = []

        if len(list1) != len(list2):
            differences.append(f"List length differs: {path} (baseline: {len(list2)}, current: {len(list1)})")

        # Compare element by element
        max_len = max(len(list1), len(list2))
        for i in range(max_len):
            elem_path = f"{path}[{i}]"

            if i >= len(list1):
                differences.append(f"Missing in current: {elem_path} = {self._truncate(str(list2[i]), 100)}")
            elif i >= len(list2):
                differences.append(f"Added in current: {elem_path} = {self._truncate(str(list1[i]), 100)}")
            elif isinstance(list1[i], dict) and isinstance(list2[i], dict):
                differences.extend(self.compare_dicts(list1[i], list2[i], elem_path))
            elif isinstance(list1[i], list) and isinstance(list2[i], list):
                differences.extend(self._compare_lists(list1[i], list2[i], elem_path))
            elif list1[i] != list2[i]:
                differences.append(f"Element differs: {elem_path} (baseline: {self._truncate(str(list2[i]), 100)}, current: {self._truncate(str(list1[i]), 100)})")

        return differences

    def _truncate(self, s: str, max_len: int) -> str:
        """Truncate string if too long."""
        if len(s) > max_len:
            return s[:max_len] + "..."
        return s

    async def run_tests(self):
        """Run tests against existing baseline."""
        print(f"Loading baseline from {self.baseline_file}...")
        if not self.load_baseline():
            print("No baseline found. Creating new baseline...")
            await self.create_baseline()
            return

        print(f"Loaded {len(self.test_cases)} devices from baseline")

        async with aiohttp.ClientSession() as session:
            for tc in self.test_cases:
                device = tc["device"]
                for version in tc["versions"]:
                    for u in ["1", "2"]:
                        key = f"{device}_{version}_u{u}"
                        baseline_response = self.baseline["baseline_responses"].get(key)

                        if not baseline_response:
                            self.results["errors"].append(f"{key}: Missing in baseline")
                            continue

                        try:
                            current_response = await self.fetch_manifest(session, device, version, u)
                            differences = self.compare_dicts(current_response, baseline_response)

                            if differences:
                                self.results["failed"] += 1
                                self.results["differences"].append({
                                    "key": key,
                                    "differences": differences
                                })
                                print(f"✗ {key}: DIFFERS")
                                for diff in differences:
                                    print(f"    {diff}")
                            else:
                                self.results["passed"] += 1
                                print(f"✓ {key}: matches")

                        except Exception as e:
                            self.results["errors"].append(f"{key}: {str(e)}")
                            print(f"✗ {key}: ERROR - {e}")

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

        if self.results["differences"]:
            print(f"\nFailed tests with differences:")
            for item in self.results["differences"][:10]:  # Show first 10
                print(f"  {item['key']}:")
                for diff in item["differences"][:3]:  # Show first 3 differences
                    print(f"    - {diff}")

        print(f"{'='*60}")


async def main():
    """Main entry point."""
    # Select environment
    env = select_environment()
    config = SERVERS[env]

    base_url = config["url"]
    baseline_file = Path(__file__).parent / config["baseline_file"]

    print("Testing /api/manifest endpoint")
    print(f"Environment: {env} - {config['name']}")
    print(f"Base URL: {base_url}")
    print(f"Source: {SRC}")
    print(f"Baseline file: {baseline_file}")
    print()

    tester = ManifestTester(base_url, baseline_file)
    await tester.run_tests()
    tester.print_summary()


if __name__ == "__main__":
    asyncio.run(main())
