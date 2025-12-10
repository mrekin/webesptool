### nRF52 Flashing Guide

*Original docs:* [https://meshtastic.org/docs/getting-started/flashing-firmware/nrf52/](https://meshtastic.org/docs/getting-started/flashing-firmware/nrf52/)

**Flashing Methods for nRF52 and RP2040 Devices**

nRF52 and RP2040 based devices have the easiest firmware upgrade process. No driver or software installation is required on any platform.
> Only the first flash might require additional steps depending on your hardware.

**Drag & Drop Method**

nRF52 and RP2040 devices use the Drag & Drop installation method to install firmware. This means:
1. Connect the device to your computer and put it in DFU mode (from the app, by double-pressing the RST button, or another method)
   - A new drive will appear on your computer
2. Download and copy the .uf2 firmware file to your device
   - After copying completes, the device will restart automatically and start working
   - The computer might show a message about incorrect device disconnection - this is normal

This method also works on mobile devices.

**Over-The-Air (OTA) Updates**

nRF52 devices can accept firmware updates over-the-air from a mobile device via Bluetooth.

For OTA flashing, you'll need an OTA file and an app that supports OTA flashing for nRF52 devices, such as nRF Connect or DFU on Android. The Meshtastic app for Android (starting from version v2.7.8) also supports OTA flashing.

- OTA flashing has some specific features:
  - It's a rather slow process
  - Flashing might fail for various reasons. In some cases, you'll need to continue with the regular Drag & Drop method. A custom bootloader can help avoid some failure scenarios.

**Factory Reset for nRF52 and RP2040**

You can perform a factory reset before installing firmware to clear data that might change format and location between releases. This requires flashing a special file using the Drag & Drop method and confirming the erase via console.

**First Flash**

The first flash might be unsuccessful. The main reason is an old bootloader version on the device.

For example, NRF52840 ProMicro boards almost always come from the factory with an old bootloader version (0.6.2).
> You can check the bootloader version by putting the device in DFU mode and reading the text file on the connected drive.

In this case, you need to download and flash using the Drag & Drop method an updated bootloader for your device from the [Adafruit](https://github.com/adafruit/Adafruit_nRF52_Bootloader/releases) repository or a custom [Adafruit_nRF52_Bootloader_OTAFIX](https://github.com/oltaco/Adafruit_nRF52_Bootloader_OTAFIX/releases)
> For example, update-nice_nano_bootloader-0.9.2_nosd.uf2 for Promicro

**SWDIO Flashing**

If your device doesn't have a bootloader supporting DFU and the device can't be flashed via D&D or OTA, another option might be flashing through SWDIO.