# DORSMP Launcher

Launcher for the DORSMP modded Minecraft server (NeoForge 1.21.1). Built on [EML Template](https://github.com/Electron-Minecraft-Launcher/EML-Template) and [EML Lib](https://github.com/Electron-Minecraft-Launcher/EML-Lib), configured from an EML AdminTool instance at `launcher.graydeon.com`.

## Changes from EML Template

- Points at the DORSMP AdminTool (`electron/const.ts`); game folder is `.dorsmp`.
- Background carousel: every image in `src/static/images/backgrounds/` rotates, with the AdminTool background shown first.
- Crash logs: after a crash the launcher offers to send logs, and Settings has a "Send logs to admins" button. Reports add `debug.log` and the JVM `hs_err_pid*.log` to what EML Lib sends, and strip voice chat transcripts. Username, UUID, tokens and IPs are masked by EML Lib.
- Launcher hides instead of closing after launch, so crashes can be detected.
- No shop panel.

## Install

Download the installer for your system from the [latest release](https://github.com/graydeon/DORSMP-Launcher/releases/latest). The launcher isn't code-signed, so Windows and macOS show a warning on first launch; [INSTALL.md](INSTALL.md) explains how to get past it.

## Develop

```bash
npm ci
npm run dev
```

## Build

```bash
npm run release:win   # or release:lin, release:mac
```

## License

MIT, as upstream. See `LICENSE` and `CREDITS`.
