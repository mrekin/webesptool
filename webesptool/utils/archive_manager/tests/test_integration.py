"""Integration tests for archive manager.

Tests the full workflow: version collection -> archive creation -> validation -> backup/removal.
"""

import json
import os
import shutil
import tempfile
import unittest
import zipfile

from ..archiver import (
    backup_files,
    create_archive,
    remove_files,
    validate_archive,
)
from ..file_operations import (
    collect_files_in_directory,
    format_size,
)
from ..version_utils import (
    collect_all_versions,
    filter_versions_below,
    get_version_range_name,
    sort_versions,
)


class TestFullArchiveWorkflow(unittest.TestCase):
    """Integration test for the complete archive workflow."""

    def setUp(self):
        """Create a realistic repository structure."""
        self.tmpdir = tempfile.mkdtemp()
        self.repo_root = os.path.join(self.tmpdir, 'meshcore')
        os.makedirs(self.repo_root)

        # Device 1: heltec-v3
        for ver in ['v1.5.0.abc123.repeater', 'v1.7.0.def456.repeater', 'v1.10.0.ghi789.repeater']:
            ver_dir = os.path.join(self.repo_root, 'heltec-v3', ver)
            os.makedirs(ver_dir)
            with open(os.path.join(ver_dir, 'ver.info'), 'w') as f:
                json.dump({'version': ver, 'date': '2025-01-01'}, f)
            with open(os.path.join(ver_dir, 'firmware.bin'), 'wb') as f:
                f.write(b'\x00' * 2048)

        # Device 2: t-beam
        for ver in ['v1.5.0.abc123.companion.ble', 'v1.10.0.ghi789.companion.ble']:
            ver_dir = os.path.join(self.repo_root, 't-beam', ver)
            os.makedirs(ver_dir)
            with open(os.path.join(ver_dir, 'ver.info'), 'w') as f:
                json.dump({'version': ver, 'date': '2025-01-01'}, f)
            with open(os.path.join(ver_dir, 'firmware.bin'), 'wb') as f:
                f.write(b'\x00' * 1024)

    def tearDown(self):
        """Clean up temporary directory."""
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_full_workflow_with_backup(self):
        """Test complete archive workflow: collect -> archive -> validate -> backup."""
        # Step 1: Collect all versions
        version_map = collect_all_versions(self.repo_root)
        self.assertGreater(len(version_map), 0)

        # Step 2: Sort versions
        sorted_vers = sort_versions(list(version_map.keys()))

        # Step 3: Filter versions below v1.10.0
        selected = filter_versions_below(sorted_vers, 'v1.10.0')
        self.assertGreater(len(selected), 0)
        # v1.10.0 should not be in the result
        for v in selected:
            self.assertFalse(v.startswith('v1.10.0'))

        # Step 4: Collect all files for selected versions
        all_dirs = []
        all_files = []
        for ver in selected:
            dirs = version_map.get(ver, [])
            all_dirs.extend(dirs)
            for d in dirs:
                all_files.extend(collect_files_in_directory(d))

        self.assertGreater(len(all_files), 0)

        # Step 5: Create archive
        archive_name = get_version_range_name(selected) + ".zip"
        archive_path = os.path.join(self.repo_root, 'archives', archive_name)
        result = create_archive(all_files, archive_path, self.repo_root)
        self.assertTrue(result)
        self.assertTrue(os.path.isfile(archive_path))

        # Step 6: Validate archive
        self.assertTrue(validate_archive(archive_path))

        # Step 7: Verify archive structure
        with zipfile.ZipFile(archive_path, 'r') as zf:
            names = zf.namelist()
            # Should have files from both devices
            heltec_files = [n for n in names if 'heltec-v3' in n]
            tbeam_files = [n for n in names if 't-beam' in n]
            self.assertGreater(len(heltec_files), 0)
            self.assertGreater(len(tbeam_files), 0)

        # Step 8: Backup original files
        result = backup_files(all_dirs, self.repo_root)
        self.assertTrue(result)

        # Step 9: Verify originals moved to backup
        backup_root = os.path.join(self.repo_root, 'backup')
        self.assertTrue(os.path.isdir(backup_root))
        # Check that some backed up directories exist
        backed_up = []
        for root, dirs, files in os.walk(backup_root):
            backed_up.extend(dirs)
        self.assertGreater(len(backed_up), 0)

    def test_full_workflow_with_removal(self):
        """Test complete archive workflow: collect -> archive -> validate -> remove."""
        version_map = collect_all_versions(self.repo_root)
        sorted_vers = sort_versions(list(version_map.keys()))
        selected = filter_versions_below(sorted_vers, 'v1.10.0')

        all_dirs = []
        all_files = []
        for ver in selected:
            dirs = version_map.get(ver, [])
            all_dirs.extend(dirs)
            for d in dirs:
                all_files.extend(collect_files_in_directory(d))

        archive_name = get_version_range_name(selected) + ".zip"
        archive_path = os.path.join(self.repo_root, 'archives', archive_name)
        create_archive(all_files, archive_path, self.repo_root)
        self.assertTrue(validate_archive(archive_path))

        # Remove original files
        result = remove_files(all_dirs)
        self.assertTrue(result)

        # Verify originals are gone
        for d in all_dirs:
            self.assertFalse(os.path.isdir(d))

        # Verify archive still exists
        self.assertTrue(os.path.isfile(archive_path))

    def test_empty_version_map(self):
        """Test with a repository that has no firmware versions."""
        empty_repo = os.path.join(self.tmpdir, 'empty_repo')
        os.makedirs(empty_repo)

        version_map = collect_all_versions(empty_repo)
        self.assertEqual(version_map, {})

    def test_single_version(self):
        """Test archiving a single version."""
        version_map = collect_all_versions(self.repo_root)
        sorted_vers = sort_versions(list(version_map.keys()))

        # Select only one version
        selected = [sorted_vers[-1]]  # oldest version
        self.assertEqual(len(selected), 1)

        all_dirs = version_map.get(selected[0], [])
        all_files = []
        for d in all_dirs:
            all_files.extend(collect_files_in_directory(d))

        archive_name = get_version_range_name(selected) + ".zip"
        archive_path = os.path.join(self.repo_root, 'archives', archive_name)
        result = create_archive(all_files, archive_path, self.repo_root)
        self.assertTrue(result)
        self.assertTrue(validate_archive(archive_path))

        # Archive name should be version-version (same min and max)
        self.assertIn(selected[0], archive_name)


if __name__ == '__main__':
    unittest.main()
