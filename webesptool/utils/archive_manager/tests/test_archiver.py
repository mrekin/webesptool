"""Tests for archiver module."""

import os
import shutil
import tempfile
import unittest
import zipfile

from ..archiver import (
    backup_files,
    calculate_archive_size,
    create_archive,
    remove_files,
    validate_archive,
)


class TestCreateArchive(unittest.TestCase):
    """Tests for create_archive function."""

    def setUp(self):
        """Create temporary directory with test files."""
        self.tmpdir = tempfile.mkdtemp()
        self.repo_root = os.path.join(self.tmpdir, 'repo')
        os.makedirs(self.repo_root)

        # Create test file structure
        device_dir = os.path.join(self.repo_root, 'heltec-v3', 'v1.5.0')
        os.makedirs(device_dir)
        with open(os.path.join(device_dir, 'firmware.bin'), 'wb') as f:
            f.write(b'\x00' * 1024)
        with open(os.path.join(device_dir, 'ver.info'), 'w') as f:
            f.write('{"version": "v1.5.0"}')

    def tearDown(self):
        """Clean up temporary directory."""
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_create_archive_with_files(self):
        """Test creating an archive with files."""
        files = []
        for root, dirs, filenames in os.walk(self.repo_root):
            for fn in filenames:
                files.append(os.path.join(root, fn))

        archive_path = os.path.join(self.tmpdir, 'test.zip')
        result = create_archive(files, archive_path, self.repo_root)

        self.assertTrue(result)
        self.assertTrue(os.path.isfile(archive_path))

        # Verify contents
        with zipfile.ZipFile(archive_path, 'r') as zf:
            names = zf.namelist()
            self.assertTrue(any('firmware.bin' in n for n in names))
            self.assertTrue(any('ver.info' in n for n in names))

    def test_create_archive_preserves_structure(self):
        """Test that archive preserves directory structure."""
        files = []
        for root, dirs, filenames in os.walk(self.repo_root):
            for fn in filenames:
                files.append(os.path.join(root, fn))

        archive_path = os.path.join(self.tmpdir, 'test.zip')
        create_archive(files, archive_path, self.repo_root)

        with zipfile.ZipFile(archive_path, 'r') as zf:
            names = zf.namelist()
            # Should have relative paths like heltec-v3/v1.5.0/firmware.bin
            has_rel_path = any(
                'heltec-v3' in n and 'v1.5.0' in n for n in names
            )
            self.assertTrue(has_rel_path)

    def test_create_archive_empty_files(self):
        """Test creating an archive with no files."""
        archive_path = os.path.join(self.tmpdir, 'test.zip')
        result = create_archive([], archive_path, self.repo_root)

        self.assertTrue(result)
        self.assertTrue(os.path.isfile(archive_path))

        with zipfile.ZipFile(archive_path, 'r') as zf:
            self.assertEqual(len(zf.namelist()), 0)

    def test_create_archive_invalid_path(self):
        """Test creating an archive with invalid path."""
        archive_path = os.path.join(self.tmpdir, 'nonexistent', 'dir', 'test.zip')
        result = create_archive([], archive_path, self.repo_root)
        # Should succeed because ensure_directory creates the path
        self.assertTrue(result)


class TestValidateArchive(unittest.TestCase):
    """Tests for validate_archive function."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_validate_valid_archive(self):
        """Test validating a valid archive."""
        archive_path = os.path.join(self.tmpdir, 'valid.zip')
        with zipfile.ZipFile(archive_path, 'w') as zf:
            zf.writestr('test.txt', 'hello')
        self.assertTrue(validate_archive(archive_path))

    def test_validate_nonexistent_archive(self):
        """Test validating a non-existent archive."""
        self.assertFalse(validate_archive('/nonexistent/file.zip'))

    def test_validate_corrupted_archive(self):
        """Test detecting a corrupted archive."""
        archive_path = os.path.join(self.tmpdir, 'corrupt.zip')
        with open(archive_path, 'wb') as f:
            f.write(b'not a zip file at all!!!')
        self.assertFalse(validate_archive(archive_path))


class TestBackupFiles(unittest.TestCase):
    """Tests for backup_files function."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.repo_root = os.path.join(self.tmpdir, 'repo')
        os.makedirs(self.repo_root)

        # Create version directory
        ver_dir = os.path.join(self.repo_root, 'heltec-v3', 'v1.5.0')
        os.makedirs(ver_dir)
        with open(os.path.join(ver_dir, 'firmware.bin'), 'wb') as f:
            f.write(b'\x00' * 512)

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_backup_moves_files(self):
        """Test that backup moves files to backup directory."""
        ver_dir = os.path.join(self.repo_root, 'heltec-v3', 'v1.5.0')
        self.assertTrue(os.path.isdir(ver_dir))

        result = backup_files([ver_dir], self.repo_root)
        self.assertTrue(result)

        # Original should be gone
        self.assertFalse(os.path.isdir(ver_dir))

        # Backup should exist
        backup_path = os.path.join(
            self.repo_root, 'backup', 'heltec-v3', 'v1.5.0'
        )
        self.assertTrue(os.path.isdir(backup_path))
        self.assertTrue(
            os.path.isfile(os.path.join(backup_path, 'firmware.bin'))
        )

    def test_backup_empty_list(self):
        """Test backup with empty list."""
        result = backup_files([], self.repo_root)
        self.assertTrue(result)


class TestRemoveFiles(unittest.TestCase):
    """Tests for remove_files function."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_remove_directories(self):
        """Test removing directories."""
        ver_dir = os.path.join(self.tmpdir, 'v1.5.0')
        os.makedirs(ver_dir)
        with open(os.path.join(ver_dir, 'file.txt'), 'w') as f:
            f.write('data')

        result = remove_files([ver_dir])
        self.assertTrue(result)
        self.assertFalse(os.path.isdir(ver_dir))

    def test_remove_nonexistent_directory(self):
        """Test removing a non-existent directory reports error."""
        result = remove_files(['/nonexistent/dir/path'])
        self.assertFalse(result)


class TestCalculateArchiveSize(unittest.TestCase):
    """Tests for calculate_archive_size function."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_calculate_size_files(self):
        """Test calculating total size of files."""
        f1 = os.path.join(self.tmpdir, 'file1.bin')
        f2 = os.path.join(self.tmpdir, 'file2.bin')
        with open(f1, 'wb') as f:
            f.write(b'\x00' * 100)
        with open(f2, 'wb') as f:
            f.write(b'\x00' * 200)

        total = calculate_archive_size([f1, f2])
        self.assertEqual(total, 300)

    def test_calculate_size_directories(self):
        """Test calculating total size of directories."""
        d1 = os.path.join(self.tmpdir, 'dir1')
        os.makedirs(d1)
        with open(os.path.join(d1, 'file.bin'), 'wb') as f:
            f.write(b'\x00' * 500)

        total = calculate_archive_size([d1])
        self.assertEqual(total, 500)


if __name__ == '__main__':
    unittest.main()
