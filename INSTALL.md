## Installing the DORSMP Launcher

The launcher isn't signed with a paid certificate, so Windows and macOS warn you the first time you open it. That's expected; the download is the same file built from this repository.

**Windows** (`DORSMP-Launcher-Setup-x.y.z.exe`)
1. Run the installer. If a blue "Windows protected your PC" box appears, click **More info**, then **Run anyway**.
2. If your browser blocks the download, choose **Keep** (Edge: the `...` menu next to the download, then **Keep**, then **Keep anyway**).

**macOS** (`.dmg`: `arm64` for Apple Silicon M1 and newer, `x64` for Intel Macs)
1. Open the `.dmg` and drag DORSMP Launcher into Applications.
2. Open it once. When macOS says it can't be opened, open **System Settings > Privacy & Security**, scroll down, and click **Open Anyway** next to DORSMP Launcher. Confirm with your password.

**Linux**
- AppImage: `chmod +x DORSMP*.AppImage`, then run it.
- Debian/Ubuntu: `sudo apt install ./DORSMP*.deb`


**Updates**
Windows and Linux launchers update themselves when you open them. On macOS the launcher tells you when a new version is out and opens the download page; install it the same way as above.
