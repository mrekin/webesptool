#!/usr/bin/env python3
"""
Test script for /api/versions endpoint.

Tests version ordering for Meshtastic and Meshcore repositories.
Validates that versions are properly sorted by semver (major.minor.patch).
Computes and stores version order in baseline.
"""

import json
import asyncio
import os
import sys
from pathlib import Path
from typing import Dict, List, Any
from datetime import datetime

import aiohttp


# Server environments
SERVERS = {
    "prod": {
        "name": "Production (Cloudflare)",
        "url": "https://mrekin.duckdns.org/flasher",
        "baseline_file": "api_versions_baseline_prod.json"
    },
    "prod_local": {
        "name": "Production Local",
        "url": "http://192.168.1.115:5550",
        "baseline_file": "api_versions_baseline_prod_local.json"
    },
    "test": {
        "name": "Test",
        "url": "http://192.168.1.115:5551",
        "baseline_file": "api_versions_baseline_test.json"
    }
}

# Test sources (will fetch devices dynamically)
TEST_SOURCES = {
    "Meshtastic": "Official repo",
    "MeshcoreRU": "Meshcore RU"
}
MAX_DEVICES_PER_SOURCE = 20


def select_environment() -> str:
    """Select server environment from command line or user input."""
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


class VersionsTester:
    def __init__(self, base_url: str, baseline_file: Path):
        self.base_url = base_url
        self.baseline_file = baseline_file
        self.baseline: Dict[str, Any] = {}
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
            return True
        return False

    def save_baseline(self):
        """Save baseline data to file."""
        sources = self.baseline.get("sources", {})
        total_devices = sum(len(s.get("devices", {})) for s in sources.values())

        baseline_data = {
            "metadata": {
                "created": datetime.now().isoformat(),
                "total_sources": len(sources),
                "total_devices": total_devices
            },
            "sources": sources
        }
        with open(self.baseline_file, 'w') as f:
            json.dump(baseline_data, f, indent=2)

    async def fetch_versions(self, session: aiohttp.ClientSession,
                            device: str, src: str) -> Dict:
        """Fetch versions from /api/versions."""
        url = f"{self.base_url}/api/versions"
        params = {"t": device, "src": src}
        async with session.get(url, params=params) as response:
            response.raise_for_status()
            return await response.json()

    async def fetch_available_devices(self, session: aiohttp.ClientSession, src: str) -> List[str]:
        """Fetch available devices from /api/availableFirmwares."""
        url = f"{self.base_url}/api/availableFirmwares"
        params = {"src": src}
        async with session.get(url, params=params) as response:
            response.raise_for_status()
            data = await response.json()
            # Combine all device types
            all_devices = []
            all_devices.extend(data.get("espdevices", []))
            all_devices.extend(data.get("uf2devices", []))
            all_devices.extend(data.get("rp2040devices", []))
            return all_devices

    def extract_semver(self, version: str) -> tuple:
        """Extract semver components from version string.

        Returns (major, minor, patch, rest) for sorting.
        Examples:
            - "v2.4.3.efc27f2" → (2, 4, 3, "efc27f2")
            - "v1.12.0.e738a74.companion.ble" → (1, 12, 0, "e738a74.companion.ble")
        """
        # Remove 'v' prefix and split by '.'
        ver_str = version.lstrip('v')
        parts = ver_str.split('.')

        if len(parts) < 3:
            # Fallback for unexpected format
            return (0, 0, 0, version)

        try:
            major = int(parts[0])
            minor = int(parts[1]) if len(parts) > 1 else 0
            patch = int(parts[2]) if len(parts) > 2 else 0
            rest = '.'.join(parts[3:]) if len(parts) > 3 else ''
            return (major, minor, patch, rest)
        except (ValueError, IndexError):
            return (0, 0, 0, version)

    def check_version_order(self, versions: List[str], repo_name: str) -> bool:
        """Check if versions are properly sorted by semver (descending).

        Returns True if sorting is correct, False otherwise.
        Also returns detailed analysis of any issues.
        """
        print(f"\n  Checking version order for {repo_name}...")

        if not versions:
            print(f"    No versions found, skipping")
            return True, None

        # Extract semver for sorting
        version_keys = [(self.extract_semver(v), v) for v in versions]

        # Sort by semver descending (major, minor, patch, then rest)
        sorted_keys = sorted(version_keys, key=lambda x: x[0], reverse=True)
        sorted_versions = [v for _, v in sorted_keys]

        # Compare with actual order
        if versions == sorted_versions:
            print(f"    ✓ Version order is correct")
            print(f"    Total: {len(versions)} versions")
            return True, None
        else:
            # Find differences
            differences = []

            print(f"    ✗ Version order is INCORRECT")
            print(f"\n    Expected (sorted by semver descending):")
            for i, v in enumerate(sorted_versions[:10]):  # Show first 10
                print(f"      {i+1}. {v}")
            if len(sorted_versions) > 10:
                print(f"      ... and {len(sorted_versions) - 10} more")

            print(f"\n    Actual (from API):")
            for i, v in enumerate(versions[:10]):
                print(f"      {i+1}. {v}")
            if len(versions) > 10:
                print(f"      ... and {len(versions) - 10} more")

            # Find specific issues
            actual_indices = {}
            for i, v in enumerate(versions):
                semver = self.extract_semver(v)
                key = (semver[0], semver[1], semver[2])
                if key not in actual_indices:
                    actual_indices[key] = []
                actual_indices[key].append((i, v))

            # Check if versions are grouped by semver
            prev_major = None
            for i, v in enumerate(versions):
                semver = self.extract_semver(v)
                major, minor, patch = semver[0], semver[1], semver[2]

                if prev_major is not None and major != prev_major:
                    # Found different major version
                    differences.append(
                        f"Major version change at position {i}: "
                        f"{prev_major} → {major}"
                    )
                prev_major = major

            # Check for mixing within same major version
            for key, positions in actual_indices.items():
                major, minor, patch = key
                if len(positions) > 1:
                    # Check if positions are sequential
                    indices = [p[0] for p in positions]
                    if indices != sorted(indices):
                        differences.append(
                            f"Version {major}.{minor}.{patch}: "
                            f"positions are not sequential: {indices}"
                        )

            if differences:
                print(f"\n    Issues found:")
                for diff in differences:
                    print(f"      - {diff}")

            return False, differences

    async def create_baseline(self):
        """Create initial baseline by fetching and validating version order."""
        print("Creating versions baseline data...")

        sources_data = {}

        async with aiohttp.ClientSession() as session:
            for source_name, src in TEST_SOURCES.items():
                print(f"\nProcessing {source_name} ({src})...")

                try:
                    # Fetch all available devices
                    all_devices = await self.fetch_available_devices(session, src)
                    print(f"  Found {len(all_devices)} total devices")

                    # Select up to MAX_DEVICES_PER_SOURCE
                    selected_devices = all_devices[:MAX_DEVICES_PER_SOURCE]
                    print(f"  Testing {len(selected_devices)} devices")

                    devices_data = {}

                    for device in selected_devices:
                        print(f"    Checking {device}...")
                        try:
                            data = await self.fetch_versions(session, device, src)
                            versions = data.get("versions", [])

                            if versions:
                                devices_data[device] = {
                                    "versions": versions
                                }
                                self.results["passed"] += 1
                            else:
                                print(f"      No versions found")

                        except Exception as e:
                            print(f"      ERROR: {e}")
                            self.results["errors"].append(f"{source_name}/{device}: {str(e)}")

                    if devices_data:
                        sources_data[source_name] = {
                            "src": src,
                            "devices": devices_data
                        }

                except Exception as e:
                    print(f"  ERROR: {e}")
                    self.results["errors"].append(f"{source_name}: {str(e)}")

        self.baseline["sources"] = sources_data
        self.save_baseline()

        # Count total devices
        total_devices = sum(len(s.get("devices", {})) for s in sources_data.values())

        print(f"\nBaseline created successfully!")
        print(f"  Sources: {len(sources_data)}")
        print(f"  Total devices: {total_devices}")
        print(f"  Passed: {self.results['passed']}")
        print(f"  Failed: {self.results['failed']}")

    async def run_tests(self):
        """Run tests against existing baseline."""
        print(f"Loading baseline from {self.baseline_file}...")

        if not self.load_baseline():
            print("No baseline found. Creating new baseline...")
            await self.create_baseline()
            return

        sources_data = self.baseline.get("sources", {})
        total_devices = sum(len(s.get("devices", {})) for s in sources_data.values())
        print(f"Loaded {len(sources_data)} sources with {total_devices} devices from baseline\n")

        async with aiohttp.ClientSession() as session:
            for source_name, source_data in sources_data.items():
                src = source_data.get("src")
                devices = source_data.get("devices", {})

                print(f"\nTesting {source_name} ({src})...")
                print(f"  Devices: {len(devices)}")

                for device, baseline_data in devices.items():
                    print(f"\n  {device}...")

                    try:
                        # Fetch current versions
                        current_data = await self.fetch_versions(session, device, src)
                        current_versions = current_data.get("versions", [])
                        baseline_versions = baseline_data.get("versions", [])

                        print(f"    Baseline: {len(baseline_versions)} versions")
                        print(f"    Current:  {len(current_versions)} versions")

                        if current_versions == baseline_versions:
                            self.results["passed"] += 1
                            print(f"    ✓ Matches baseline")
                        else:
                            self.results["failed"] += 1

                            # Find positions where versions differ
                            diffs = []
                            min_len = min(len(baseline_versions), len(current_versions))
                            for i in range(min_len):
                                if baseline_versions[i] != current_versions[i]:
                                    diffs.append(f"    pos {i}: baseline={baseline_versions[i]}, current={current_versions[i]}")

                            # Show extra elements if lengths differ
                            if len(baseline_versions) > len(current_versions):
                                for i in range(len(current_versions), len(baseline_versions)):
                                    diffs.append(f"    pos {i}: baseline={baseline_versions[i]}, current=(missing)")
                            elif len(current_versions) > len(baseline_versions):
                                for i in range(len(baseline_versions), len(current_versions)):
                                    diffs.append(f"    pos {i}: baseline=(missing), current={current_versions[i]}")

                            diff_info = {
                                "source": source_name,
                                "device": device,
                                "baseline_count": len(baseline_versions),
                                "current_count": len(current_versions),
                                "differences": diffs
                            }
                            self.results["differences"].append(diff_info)

                            print(f"    ✗ Order changed:")
                            for line in diffs:
                                print(f"      {line}")

                    except Exception as e:
                        self.results["failed"] += 1
                        self.results["errors"].append(f"{source_name}/{device}: {str(e)}")
                        print(f"    ✗ ERROR - {e}")

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
            print(f"\nDifferences:")
            for diff in self.results["differences"]:
                source = diff.get('source', 'Unknown')
                device = diff.get('device', 'Unknown')
                print(f"  - {source}/{device}:")

                added = diff.get('added', [])
                if added:
                    print(f"      Added ({len(added)}): {', '.join(added[:5])}{'...' if len(added) > 5 else ''}")

                removed = diff.get('removed', [])
                if removed:
                    print(f"      Removed ({len(removed)}): {', '.join(removed[:5])}{'...' if len(removed) > 5 else ''}")

                if not added and not removed:
                    print(f"      Order changed (same versions)")

        print(f"{'='*60}")


async def main():
    """Main entry point."""
    # Select environment
    env = select_environment()
    config = SERVERS[env]

    base_url = config["url"]
    baseline_file = Path(__file__).parent / config["baseline_file"]

    print(f"Testing /api/versions endpoint")
    print(f"Environment: {env} - {config['name']}")
    print(f"Base URL: {base_url}")
    print(f"Baseline file: {baseline_file}")
    print()

    tester = VersionsTester(base_url, baseline_file)
    await tester.run_tests()
    tester.print_summary()


if __name__ == "__main__":
    asyncio.run(main())
