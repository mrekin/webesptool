"""Tests for file_operations module."""

import os
import shutil
import tempfile
import unittest

from ..file_operations import (
    calculate_total_size,
    collect_files_in_directory,
    ensure_directory,
    format_size,
    get_disk_space,
    get_relative_path,
)


class TestEnsureDirectory(unittest.TestCase):
    """Tests for ensure_directory function."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_create_new_directory(self):
        """Test creating a new directory."""
        new_dir = os.path.join(self.tmpdir, 'new_dir')
        self.assertFalse(os.path.isdir(new_dir))

        ensure_directory(new_dir)
        self.assertTrue(os.path.isdir(new_dir))

    def test_create_nested_directory(self):
        """Test creating nested directories."""
        nested = os.path.join(self.tmpdir, 'a', 'b', 'c')
        ensure_directory(nested)
        self.assertTrue(os.path.isdir(nested))

    def test_existing_directory(self):
        """Test calling on existing directory does not raise."""
        ensure_directory(self.tmpdir)
        self.assertTrue(os.path.isdir(self.tmpdir))


class TestGetRelativePath(unittest.TestCase):
    """Tests for get_relative_path function."""

    def test_relative_path_basic(self):
        """Test computing relative path."""
        result = get_relative_path('/a/b/c/file.txt', '/a/b')
        self.assertEqual(result, os.path.join('c', 'file.txt'))

    def test_relative_path_same_dir(self):
        """Test relative path in same directory."""
        result = get_relative_path('/a/b/file.txt', '/a/b')
        self.assertEqual(result, 'file.txt')


class TestGetDiskSpace(unittest.TestCase):
    """Tests for get_disk_space function."""

    def test_get_disk_space_returns_positive(self):
        """Test that disk space is a positive number."""
        space = get_disk_space('/tmp')
        self.assertGreater(space, 0)


class TestFormatSize(unittest.TestCase):
    """Tests for format_size function."""

    def test_format_bytes(self):
        """Test formatting bytes."""
        result = format_size(500)
        self.assertEqual(result, '500.0 B')

    def test_format_kilobytes(self):
        """Test formatting kilobytes."""
        result = format_size(1024)
        self.assertEqual(result, '1.0 KB')

    def test_format_megabytes(self):
        """Test formatting megabytes."""
        result = format_size(1024 * 1024)
        self.assertEqual(result, '1.0 MB')

    def test_format_gigabytes(self):
        """Test formatting gigabytes."""
        result = format_size(1024 * 1024 * 1024)
        self.assertEqual(result, '1.0 GB')

    def test_format_zero(self):
        """Test formatting zero."""
        result = format_size(0)
        self.assertEqual(result, '0.0 B')

    def test_format_negative(self):
        """Test formatting negative value."""
        result = format_size(-1)
        self.assertEqual(result, '0 B')


class TestCalculateTotalSize(unittest.TestCase):
    """Tests for calculate_total_size function."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_calculate_total_size_files(self):
        """Test total size of files."""
        f1 = os.path.join(self.tmpdir, 'f1')
        f2 = os.path.join(self.tmpdir, 'f2')
        with open(f1, 'wb') as f:
            f.write(b'\x00' * 100)
        with open(f2, 'wb') as f:
            f.write(b'\x00' * 200)

        result = calculate_total_size([f1, f2])
        self.assertEqual(result, 300)

    def test_calculate_total_size_empty(self):
        """Test total size of empty list."""
        result = calculate_total_size([])
        self.assertEqual(result, 0)


class TestCollectFilesInDirectory(unittest.TestCase):
    """Tests for collect_files_in_directory function."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_collect_files(self):
        """Test collecting files from a directory."""
        with open(os.path.join(self.tmpdir, 'file1.txt'), 'w') as f:
            f.write('a')
        with open(os.path.join(self.tmpdir, 'file2.txt'), 'w') as f:
            f.write('b')

        result = collect_files_in_directory(self.tmpdir)
        self.assertEqual(len(result), 2)

    def test_collect_files_nested(self):
        """Test collecting files from nested directories."""
        subdir = os.path.join(self.tmpdir, 'sub')
        os.makedirs(subdir)
        with open(os.path.join(subdir, 'file.txt'), 'w') as f:
            f.write('c')

        result = collect_files_in_directory(self.tmpdir)
        self.assertEqual(len(result), 1)

    def test_collect_files_nonexistent(self):
        """Test collecting from non-existent directory."""
        result = collect_files_in_directory('/nonexistent')
        self.assertEqual(result, [])


if __name__ == '__main__':
    unittest.main()
