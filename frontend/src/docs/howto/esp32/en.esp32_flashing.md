### ESP32 Flashing Guide

*Original docs:* [https://meshtastic.org/docs/getting-started/flashing-firmware/esp32/](https://meshtastic.org/docs/getting-started/flashing-firmware/esp32/)

**Flashing Methods for ESP32 Devices**

There are several available methods for flashing your ESP32 device: Web Flasher or manual flashing using esptool or flash_download_tool utilities.

Depending on the installed MCU version (ESP32, ESP32-S3, ESP32-C3, ESP32-C6, etc.), you may need to put the device in boot mode before flashing. In most cases, you need to power on the device while holding the "boot" button. Depending on the MCU and firmware settings, manual boot mode entry may be required only for the first flash, or for every flash.
> If flashing doesn't start - try putting it in boot mode manually

**Web Flasher Method**

The easiest method, especially for inexperienced users.

[Official Meshtastic Flasher](https://flasher.meshtastic.org) or [Mrekin Meshtastic Flasher](https://mrekin.duckdns.org/flasher/)

Flashing requires a computer with a browser running on Chromium engine (such as Chrome, Edge, Vivaldi, Brave, Yandex, etc.).

The process is simple:
1. select your device and firmware version from the list
2. connect the device in boot mode to your computer
3. select the mode (update or full flash)
4. press the start button and wait for the flashing to complete

**Over-The-Air (OTA) Updates**

OTA updates for ESP32 devices do not work due to insufficient memory for flashing on the devices.