"""
Configuration loader for archive manager.

Loads and provides access to repository configuration from config.yml.
"""

import os
import sys
from typing import Optional

import yaml


def load_config(config_path: str = None) -> dict:
    """
    Load configuration from config.yml.

    Args:
        config_path: Optional path to config file. If not provided,
                     searches in standard locations.

    Returns:
        Parsed configuration dictionary.

    Raises:
        FileNotFoundError: If config file not found.
        yaml.YAMLError: If config file cannot be parsed.
    """
    if config_path is None:
        # Search for config in standard locations
        candidates = [
            os.path.join(os.path.dirname(__file__), '..', '..', 'config', 'config.yml'),
            os.path.join(os.getcwd(), 'config', 'config.yml'),
        ]
        for candidate in candidates:
            candidate = os.path.normpath(candidate)
            if os.path.isfile(candidate):
                config_path = candidate
                break

    if config_path is None or not os.path.isfile(config_path):
        raise FileNotFoundError("Configuration file config.yml not found")

    with open(config_path, 'r') as f:
        cfg_data = yaml.safe_load(f)

    # Merge base config with environment-specific overrides
    base = cfg_data.get('base', {}) or {}
    env_name = cfg_data.get('enviroment', 'dev')
    envs = cfg_data.get('enviroments', {}) or {}
    diff = envs.get(env_name, {}) or {}

    config = {**base, **diff}
    return config


def get_repositories(config: dict) -> list:
    """
    Get list of available repositories from config.

    Args:
        config: Configuration dictionary.

    Returns:
        List of repository entries (strings or dicts with path/src/type).
    """
    fw_dirs = config.get('fwDirs', [])
    repos = []
    for entry in fw_dirs:
        if isinstance(entry, str):
            repos.append({
                'path': entry,
                'src': None,
                'desc': '',
                'type': 'meshtastic',
            })
        elif isinstance(entry, dict):
            repos.append({
                'path': entry.get('path', ''),
                'src': entry.get('src', None),
                'desc': entry.get('desc', ''),
                'type': entry.get('type', 'meshtastic'),
            })
    return repos


def get_repository_path(repo: dict) -> str:
    """
    Get filesystem path for a repository entry.

    Args:
        repo: Repository entry dict.

    Returns:
        Absolute path to the repository root directory.
    """
    path = repo.get('path', '')
    if not os.path.isabs(path):
        # Resolve relative to the config directory
        config_dir = os.path.join(os.path.dirname(__file__), '..', '..')
        path = os.path.normpath(os.path.join(config_dir, path))
    return path


def get_repository_type(repo: dict) -> str:
    """
    Get firmware type for a repository entry.

    Args:
        repo: Repository entry dict.

    Returns:
        Firmware type string ('meshtastic' or 'meshcore').
    """
    return repo.get('type', 'meshtastic')
