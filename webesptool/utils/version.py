"""
Version comparison utility.

Provides CustomLooseVersion class for sorting and comparing firmware versions.
Shared between service.py and other modules like archive_manager.
"""

import re
from looseversion import LooseVersion


class CustomLooseVersion(LooseVersion):
    """
    Extended LooseVersion that handles meshtastic-specific version formats.

    Supports version strings like:
    - v2.4.3.efc27f2
    - v1.11.0.6d32193.companion.ble
    - v1.5.0.daily
    """

    def parse(self, vstring):
        self.vstring = vstring
        components = re.split(r'[\. ]', vstring)
        for i, obj in enumerate(components):
            try:
                components[i] = int(obj)
            except ValueError:
                pass

        self.version = components

    def _cmp(self, other):
        if isinstance(other, str):
            other = CustomLooseVersion(other)
        elif not isinstance(other, CustomLooseVersion):
            return NotImplemented

        # If elements have different types - compare as strings
        min_len = min(len(self.version), len(other.version))
        for i in range(min_len):
            try:
                if i >= len(other.version):
                    return 1
                if i >= len(self.version):
                    return -1

                if type(self.version[i]) != type(other.version[i]):
                    self.version[i] = str(self.version[i])
                    other.version[i] = str(other.version[i])
            except Exception:
                pass

        if "daily" in self.vstring and "daily" not in other.vstring and self.version[:len(self.version)-1] == other.version[:len(other.version)-1]:
            return 1
        if "daily" not in self.vstring and "daily" in other.vstring and self.version[:len(self.version)-1] == other.version[:len(other.version)-1]:
            return -1

        if self.version == other.version:
            return 0
        if self.version < other.version:
            return -1
        if self.version > other.version:
            return 1
