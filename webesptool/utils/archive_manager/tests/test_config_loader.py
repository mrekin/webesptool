"""Tests for config_loader module."""

import os
import tempfile
import unittest

import yaml

from ..config_loader import (
    get_repositories,
    get_repository_path,
    get_repository_type,
    load_config,
)


class TestLoadConfig(unittest.TestCase):
    """Tests for load_config function."""

    def test_load_config_valid(self):
        """Test loading a valid config file."""
        config_data = {
            'enviroment': 'dev',
            'base': {
                'fwDirs': [
                    'data/',
                    {
                        'path': 'meshcore/',
                        'src': 'meshcore',
                        'type': 'meshcore',
                    },
                ],
            },
            'enviroments': {
                'dev': {},
                'prod': {},
            },
        }

        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.yml', delete=False
        ) as f:
            yaml.dump(config_data, f)
            config_path = f.name

        try:
            config = load_config(config_path)
            self.assertIn('fwDirs', config)
            self.assertEqual(len(config['fwDirs']), 2)
        finally:
            os.unlink(config_path)

    def test_load_config_not_found(self):
        """Test loading a non-existent config file."""
        with self.assertRaises(FileNotFoundError):
            load_config('/nonexistent/path/config.yml')

    def test_load_config_invalid_yaml(self):
        """Test loading an invalid YAML file."""
        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.yml', delete=False
        ) as f:
            f.write("invalid: [yaml: content: {")
            config_path = f.name

        try:
            with self.assertRaises(yaml.YAMLError):
                load_config(config_path)
        finally:
            os.unlink(config_path)

    def test_load_config_env_override(self):
        """Test that environment-specific config merges correctly."""
        config_data = {
            'enviroment': 'prod',
            'base': {
                'fwDirs': ['data/'],
                'extra_key': 'base_value',
            },
            'enviroments': {
                'dev': {},
                'prod': {
                    'extra_key': 'prod_value',
                },
            },
        }

        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.yml', delete=False
        ) as f:
            yaml.dump(config_data, f)
            config_path = f.name

        try:
            config = load_config(config_path)
            self.assertEqual(config.get('extra_key'), 'prod_value')
        finally:
            os.unlink(config_path)


class TestGetRepositories(unittest.TestCase):
    """Tests for get_repositories function."""

    def test_get_repositories_string_entries(self):
        """Test getting repos from string entries."""
        config = {
            'fwDirs': ['data/', 'data2/'],
        }
        repos = get_repositories(config)
        self.assertEqual(len(repos), 2)
        self.assertEqual(repos[0]['path'], 'data/')
        self.assertEqual(repos[0]['type'], 'meshtastic')

    def test_get_repositories_dict_entries(self):
        """Test getting repos from dict entries."""
        config = {
            'fwDirs': [
                {
                    'path': 'meshcore/',
                    'src': 'meshcore',
                    'desc': 'Meshcore firmware',
                    'type': 'meshcore',
                },
            ],
        }
        repos = get_repositories(config)
        self.assertEqual(len(repos), 1)
        self.assertEqual(repos[0]['src'], 'meshcore')
        self.assertEqual(repos[0]['type'], 'meshcore')

    def test_get_repositories_empty(self):
        """Test getting repos from empty config."""
        config = {}
        repos = get_repositories(config)
        self.assertEqual(repos, [])

    def test_get_repositories_mixed(self):
        """Test getting repos from mixed entries."""
        config = {
            'fwDirs': [
                'data/',
                {
                    'path': 'meshcore/',
                    'src': 'meshcore',
                    'type': 'meshcore',
                },
            ],
        }
        repos = get_repositories(config)
        self.assertEqual(len(repos), 2)


class TestGetRepositoryPath(unittest.TestCase):
    """Tests for get_repository_path function."""

    def test_get_repository_path_relative(self):
        """Test resolving a relative path."""
        repo = {'path': 'data/'}
        path = get_repository_path(repo)
        self.assertTrue(os.path.isabs(path))

    def test_get_repository_path_absolute(self):
        """Test an absolute path is returned as-is."""
        repo = {'path': '/absolute/path/data/'}
        path = get_repository_path(repo)
        self.assertEqual(path, '/absolute/path/data/')


class TestGetRepositoryType(unittest.TestCase):
    """Tests for get_repository_type function."""

    def test_get_type_meshtastic(self):
        """Test getting meshtastic type."""
        repo = {'type': 'meshtastic'}
        self.assertEqual(get_repository_type(repo), 'meshtastic')

    def test_get_type_meshcore(self):
        """Test getting meshcore type."""
        repo = {'type': 'meshcore'}
        self.assertEqual(get_repository_type(repo), 'meshcore')

    def test_get_type_default(self):
        """Test default type when not specified."""
        repo = {}
        self.assertEqual(get_repository_type(repo), 'meshtastic')


if __name__ == '__main__':
    unittest.main()
