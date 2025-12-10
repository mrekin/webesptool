
*Original docs: https://meshtastic.org/docs/getting-started/flashing-firmware/nrf52/*

**Flashing Methods for nRF52 and RP2040 Devices**

nRF52 and RP2040 based devices have the easiest firmware upgrade process. No driver or software install is required on any platform.

**Drag & Drop**

nRF52 and RP2040 devices use the Drag & Drop installation method to install firmware releases.

**Over-The-Air (OTA)**

nRF52 devices are able to accept OTA firmware updates from a mobile device over bluetooth.

**nRF Factory Erase**

You may wish to perform a Factory Erase prior to installing firmware to clear data that may change format and location between releases.

**Convert RAK4631-R to RAK4631**

If your device did not come with the Arduino bootloader you will need to perform the conversion.

**Use Raspberry Pi as a SWDIO Flash Tool**

If your device can't be flashed through USB or Bluetooth, another option might be a direct SWDIO connection.