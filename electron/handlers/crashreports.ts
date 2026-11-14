import { ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CrashReport, Launcher } from 'eml-lib'
import type { Account, LauncherEvents } from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL, GAME_FOLDER } from '../const'

type CrashData = LauncherEvents['launch_crash'][0]
type Logs = { launcherLogs: string; launchArgs: string; crashReportLog: string; latestLog: string }

type PendingCrashReport = {
  launcher: Launcher
  crashData: CrashData
  sending: boolean
}

export type CrashReportIntegration = {
  instance: CrashReport
  attachLauncher: (launcher: Launcher) => void
}

// The AdminTool rejects bodies over 5 MB; logs are gzipped (~10x), so this keeps a report well under it.
const MAX_LOG_CHARS = 3_000_000
// Lines that carry players' transcribed voice chat. Never useful for crash triage, so they never leave the PC.
const SPEECH_LINE = /^.*(?:Live translated local speech|Translated local speech sentence|Live translated remote speech|Translated remote speech).*$/gm

function stripSpeech(text: string) {
  return text.replace(SPEECH_LINE, '[voice transcript line removed]')
}

function tail(text: string) {
  return text.length > MAX_LOG_CHARS ? `[... ${text.length - MAX_LOG_CHARS} earlier characters cut ...]\n${text.slice(-MAX_LOG_CHARS)}` : text
}

// Native crashes (exit code 0xC0000005 and friends) leave no Minecraft crash report, only debug.log and a JVM hs_err file.
async function extraLogs(gameDir: string) {
  let out = ''
  try {
    const debug = await fs.readFile(path.join(gameDir, 'logs', 'debug.log'), 'utf-8')
    out += `\n\n=== DEBUG LOG (debug.log) ===\n${tail(stripSpeech(debug))}`
  } catch {
    out += '\n\n=== DEBUG LOG ===\nlogs/debug.log not found.'
  }
  try {
    const files = await fs.readdir(gameDir)
    const errs = await Promise.all(
      files.filter((f) => /^hs_err_pid\d+\.log$/.test(f)).map(async (f) => ({ f, t: (await fs.stat(path.join(gameDir, f))).mtimeMs }))
    )
    const newest = errs.sort((a, b) => b.t - a.t)[0]
    if (newest && Date.now() - newest.t < 24 * 3600 * 1000) {
      out += `\n\n=== JVM FATAL ERROR LOG (${newest.f}) ===\n${tail(await fs.readFile(path.join(gameDir, newest.f), 'utf-8'))}`
    }
  } catch {
    // no game dir yet
  }
  return out
}

function createCrashReport() {
  const instance = new CrashReport(ADMINTOOL_URL)
  // eml-lib reads latest.log and the newest crash-reports/*.txt; add debug.log and hs_err, and drop voice transcripts.
  // Everything still goes through eml-lib's sanitizer (username, UUID, tokens, IPs) afterwards.
  const internal = instance as unknown as {
    readLogs: (launcher: Launcher, crashData: CrashData) => Promise<Logs>
    sanitizeText: (text: string, launcher: Launcher) => string
  }
  const readLogs = internal.readLogs.bind(instance)
  internal.readLogs = async (launcher, crashData) => {
    const logs = await readLogs(launcher, crashData)
    logs.latestLog = tail(stripSpeech(logs.latestLog))
    logs.launcherLogs = stripSpeech(logs.launcherLogs)
    logs.crashReportLog = `=== PLAYER ===\n${launcher.config.account.name}\n\n${logs.crashReportLog}${await extraLogs(launcher.config.root)}`
    return logs
  }
  // Admins need to know who crashed, so keep the Minecraft username. UUID, tokens, the PC's
  // account name and IPs are still masked by eml-lib.
  const sanitizeText = internal.sanitizeText.bind(instance)
  internal.sanitizeText = (text, launcher) => {
    const keepName = Object.create(launcher) as Launcher
    Object.defineProperty(keepName, 'config', { value: { ...launcher.config, account: { ...launcher.config.account, name: '' } } })
    return sanitizeText(text, keepName)
  }
  return instance
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unknown error occurred.'
}

export function registerCrashReportHandlers(mainWindow: BrowserWindow): CrashReportIntegration {
  const instance = createCrashReport()
  const pending = new Map<string, PendingCrashReport>()
  let lastLauncher: Launcher | null = null
  let lastExitCode = 0

  ipcMain.handle('crashreports:send', async (_event, id: string) => {
    const report = pending.get(id)
    if (!report) return { success: false, error: 'This crash report is no longer available.' }
    if (report.sending) return { success: false, error: 'This crash report is already being sent.' }

    report.sending = true
    try {
      await instance.send(report.launcher, report.crashData)
      pending.delete(id)
      return { success: true }
    } catch (error) {
      report.sending = false
      logger.error('Failed to send game crash report:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle('crashreports:dismiss', (_event, id: string) => {
    pending.delete(id)
  })

  // Settings > "Send logs": for freezes, crashes after the launcher closed, or anything the automatic prompt missed.
  ipcMain.handle('crashreports:sendLogs', async (_event, payload: { account: Account; profileSlug?: string }) => {
    try {
      const sameProfile = lastLauncher && lastLauncher.config.profile.slug === payload.profileSlug
      const launcher = sameProfile ? lastLauncher! : new Launcher({ url: ADMINTOOL_URL, root: GAME_FOLDER, profile: { slug: payload.profileSlug }, account: payload.account })
      const gameDir = launcher.config.root
      await instance.send(launcher, {
        code: sameProfile ? lastExitCode : 0,
        date: new Date().toISOString(),
        javaPath: path.join(gameDir, 'runtime', 'jre-21', 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
        logsPath: path.join(gameDir, 'logs', 'latest.log'),
        crashReportsDir: path.join(gameDir, 'crash-reports')
      })
      return { success: true }
    } catch (error) {
      logger.error('Failed to send logs:', error)
      return { success: false, error: errorMessage(error) }
    }
  })

  return {
    instance,
    attachLauncher(launcher) {
      lastLauncher = launcher
      launcher.on('launch_close', (code) => (lastExitCode = code ?? -1))
      launcher.on('launch_crash', (crashData) => {
        const id = randomUUID()
        pending.set(id, { launcher, crashData, sending: false })

        if (!mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore()
          if (!mainWindow.isVisible()) mainWindow.show()
          mainWindow.focus()
          mainWindow.webContents.send('crashreports:detected', {
            id,
            exitCode: crashData.code,
            date: crashData.date,
            profile: launcher.config.profile.slug ?? 'Default profile',
            minecraftVersion: launcher.config.minecraft.version ?? 'unknown'
          })
        }
      })
    }
  }
}
