"""Tests for version_utils module."""

import json
import os
import tempfile
import unittest

from ..version_utils import (
    collect_all_versions,
    collect_versions,
    filter_versions_below,
    get_version_range_name,
    parse_version_info,
    sort_versions,
)


class TestParseVersionInfo(unittest.TestCase):
    """Tests for parse_version_info function."""

    def test_parse_valid_ver_info(self):
        """Test parsing a valid ver.info file."""
        data = {
            'version': 'v1.11.0.6d32193.companion.ble',
            'date': '2025-12-22 12:16:47',
            'notes': 'Firmware organized from release assets',
            'latestTag': '',
        }

        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.json', delete=False
        ) as f:
            json.dump(data, f)
            path = f.name

        try:
            result = parse_version_info(path)
            self.assertIsNotNone(result)
            self.assertEqual(result['version'], 'v1.11.0.6d32193.companion.ble')
            self.assertEqual(result['date'], '2025-12-22 12:16:47')
        finally:
            os.unlink(path)

    def test_parse_nonexistent_file(self):
        """Test parsing a non-existent file returns None."""
        result = parse_version_info('/nonexistent/ver.info')
        self.assertIsNone(result)

    def test_parse_invalid_json(self):
        """Test parsing invalid JSON returns None."""
        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.json', delete=False
        ) as f:
            f.write("not valid json {{{")
            path = f.name

        try:
            result = parse_version_info(path)
            self.assertIsNone(result)
        finally:
            os.unlink(path)


class TestCollectVersions(unittest.TestCase):
    """Tests for collect_versions function."""

    def setUp(self):
        """Create a temporary directory structure for testing."""
        self.tmpdir = tempfile.mkdtemp()
        self.device_dir = os.path.join(self.tmpdir, 'heltec-v3')
        os.makedirs(self.device_dir)

        # Create version directories with ver.info files
        v1_dir = os.path.join(self.device_dir, 'v1.5.0.abc123')
        os.makedirs(v1_dir)
        with open(os.path.join(v1_dir, 'ver.info'), 'w') as f:
            json.dump({'version': 'v1.5.0.abc123', 'date': '2025-01-01'}, f)
        with open(os.path.join(v1_dir, 'firmware.bin'), 'w') as f:
            f.write('fake binary')

        v2_dir = os.path.join(self.device_dir, 'v1.10.0.def456')
        os.makedirs(v2_dir)
        with open(os.path.join(v2_dir, 'ver.info'), 'w') as f:
            json.dump({'version': 'v1.10.0.def456', 'date': '2025-06-01'}, f)
        with open(os.path.join(v2_dir, 'firmware.bin'), 'w') as f:
            f.write('fake binary 2')

    def tearDown(self):
        """Clean up temporary directory."""
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_collect_versions_found(self):
        """Test collecting versions from a device directory."""
        versions = collect_versions(self.tmpdir, 'heltec-v3')
        self.assertEqual(len(versions), 2)
        # Versions come from ver.info
        self.assertIn('v1.5.0.abc123', versions)
        self.assertIn('v1.10.0.def456', versions)

    def test_collect_versions_nonexistent_device(self):
        """Test collecting versions from a non-existent device."""
        versions = collect_versions(self.tmpdir, 'nonexistent')
        self.assertEqual(versions, [])


class TestCollectAllVersions(unittest.TestCase):
    """Tests for collect_all_versions function."""

    def setUp(self):
        """Create a temporary repository structure."""
        self.tmpdir = tempfile.mkdtemp()

        # Device 1
        d1 = os.path.join(self.tmpdir, 'heltec-v3', 'v1.5.0.abc123')
        os.makedirs(d1)
        with open(os.path.join(d1, 'ver.info'), 'w') as f:
            json.dump({'version': 'v1.5.0.abc123', 'date': '2025-01-01'}, f)

        d2 = os.path.join(self.tmpdir, 'heltec-v3', 'v1.10.0.def456')
        os.makedirs(d2)
        with open(os.path.join(d2, 'ver.info'), 'w') as f:
            json.dump({'version': 'v1.10.0.def456', 'date': '2025-06-01'}, f)

        # Device 2 with same version
        d3 = os.path.join(self.tmpdir, 't-beam', 'v1.10.0.def456')
        os.makedirs(d3)
        with open(os.path.join(d3, 'ver.info'), 'w') as f:
            json.dump({'version': 'v1.10.0.def456', 'date': '2025-06-01'}, f)

    def tearDown(self):
        """Clean up temporary directory."""
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_collect_all_versions(self):
        """Test collecting all versions across devices."""
        version_map = collect_all_versions(self.tmpdir)
        # Two unique versions
        self.assertEqual(len(version_map), 2)
        self.assertIn('v1.5.0.abc123', version_map)
        self.assertIn('v1.10.0.def456', version_map)

    def test_version_map_has_correct_paths(self):
        """Test that version map contains correct directory paths."""
        version_map = collect_all_versions(self.tmpdir)
        v10_paths = version_map['v1.10.0.def456']
        # v1.10.0 exists in two devices
        self.assertEqual(len(v10_paths), 2)

    def test_collect_all_versions_empty_repo(self):
        """Test collecting from an empty directory."""
        empty_dir = tempfile.mkdtemp()
        try:
            version_map = collect_all_versions(empty_dir)
            self.assertEqual(version_map, {})
        finally:
            os.rmdir(empty_dir)


class TestSortVersions(unittest.TestCase):
    """Tests for sort_versions function."""

    def test_sort_meshtastic_versions(self):
        """Test sorting meshtastic-style versions."""
        versions = ['v1.10.0', 'v1.5.0', 'v1.9.0', 'v2.0.0']
        result = sort_versions(versions)
        self.assertEqual(result, ['v2.0.0', 'v1.10.0', 'v1.9.0', 'v1.5.0'])

    def test_sort_meshcore_versions(self):
        """Test sorting meshcore-style versions."""
        versions = [
            'v1.11.0.6d32193.companion.ble',
            'v1.5.0.abc123.repeater',
            'v1.10.0.def456.companion.ble',
        ]
        result = sort_versions(versions)
        self.assertEqual(result[0], 'v1.11.0.6d32193.companion.ble')
        self.assertEqual(result[-1], 'v1.5.0.abc123.repeater')

    def test_sort_empty_list(self):
        """Test sorting empty list."""
        result = sort_versions([])
        self.assertEqual(result, [])

    def test_sort_single_version(self):
        """Test sorting a single version."""
        result = sort_versions(['v1.0.0'])
        self.assertEqual(result, ['v1.0.0'])


class TestFilterVersionsBelow(unittest.TestCase):
    """Tests for filter_versions_below function."""

    def test_filter_below_basic(self):
        """Test filtering versions below a threshold."""
        versions = ['v1.10.0', 'v1.5.0', 'v1.9.0', 'v2.0.0']
        result = filter_versions_below(versions, 'v1.10.0')
        self.assertEqual(result, ['v1.9.0', 'v1.5.0'])

    def test_filter_below_all_below(self):
        """Test when all versions are below threshold."""
        versions = ['v1.1.0', 'v1.2.0']
        result = filter_versions_below(versions, 'v2.0.0')
        self.assertEqual(len(result), 2)

    def test_filter_below_none_below(self):
        """Test when no versions are below threshold."""
        versions = ['v2.0.0', 'v3.0.0']
        result = filter_versions_below(versions, 'v1.0.0')
        self.assertEqual(result, [])

    def test_filter_below_exact_match_excluded(self):
        """Test that exact threshold version is excluded."""
        versions = ['v1.10.0', 'v1.9.0']
        result = filter_versions_below(versions, 'v1.10.0')
        self.assertNotIn('v1.10.0', result)
        self.assertIn('v1.9.0', result)


class TestGetVersionRangeName(unittest.TestCase):
    """Tests for get_version_range_name function."""

    def test_range_name_basic(self):
        """Test generating range name from versions."""
        versions = ['v1.5.0', 'v1.9.0', 'v1.7.0']
        result = get_version_range_name(versions)
        self.assertEqual(result, 'v1.5.0-v1.9.0')

    def test_range_name_single_version(self):
        """Test generating range name from a single version."""
        versions = ['v1.5.0']
        result = get_version_range_name(versions)
        self.assertEqual(result, 'v1.5.0-v1.5.0')

    def test_range_name_empty(self):
        """Test generating range name from empty list."""
        result = get_version_range_name([])
        self.assertEqual(result, 'empty')


if __name__ == '__main__':
    unittest.main()
