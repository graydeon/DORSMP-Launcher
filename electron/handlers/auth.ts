import { ipcMain, app } from 'electron'
import { MicrosoftAuth } from 'eml-lib'
import type { Account } from 'eml-lib'
import logger from 'electron-log/main'
import * as fs from 'node:fs'
import * as path from 'node:path'

const sessionPath = path.join(app.getPath('userData'), 'session.json')

export type IAuthResponse = { success: true; account: Account } | { success: false; error: string }

// Minecraft access tokens last 24 h and the launcher can stay open far longer (it only minimizes on launch),
// so the token is checked again right before every launch, not just at startup.
export async function ensureFreshAccount(auth: MicrosoftAuth, account: Account): Promise<Account> {
  // The renderer keeps the account from startup; an earlier pre-launch refresh may have saved a newer one.
  try {
    const saved = JSON.parse(fs.readFileSync(sessionPath, 'utf-8')) as Account
    if (saved.uuid === account.uuid) account = saved
  } catch {}
  if (await auth.validate(account)) return account
  try {
    const fresh = await auth.refresh(account)
    fs.writeFileSync(sessionPath, JSON.stringify(fresh))
    logger.log('Refreshed the Minecraft session before launch.')
    return fresh
  } catch (err) {
    // Keep launching with the old token: validate also fails when Mojang is merely unreachable.
    logger.warn('Could not refresh the Minecraft session before launch:', err)
    return account
  }
}

// eml-lib passes the access token itself as --xuid when account.xbox is missing (it always is for Microsoft
// logins), and Minecraft logs --xuid unmasked. Give it the real numeric xuid, which the token carries as a claim.
export function withXuid(account: Account): Account {
  if (account.xbox?.xuid) return account
  let claims: { xuid?: string; agg?: string } = {}
  try {
    claims = JSON.parse(Buffer.from(account.accessToken.split('.')[1], 'base64url').toString())
  } catch {}
  return { ...account, xbox: { xuid: /^\d+$/.test(claims.xuid ?? '') ? claims.xuid! : '0', gamertag: '', ageGroup: claims.agg ?? '' } }
}

export function registerAuthHandlers(mainWindow: Electron.BrowserWindow): MicrosoftAuth {
  const auth = new MicrosoftAuth(mainWindow)

  ipcMain.handle('auth:login', async () => {
    try {
      const account = await auth.auth()
      fs.writeFileSync(sessionPath, JSON.stringify(account))
      return { success: true, account } as IAuthResponse
    } catch (err: any) {
      logger.error('Failed to login:', err)
      return { success: false, error: err.message ?? 'Unknown error' }
    }
  })

  ipcMain.handle('auth:refresh', async () => {
    if (!fs.existsSync(sessionPath)) {
      return { success: false } as { success: false }
    }

    try {
      const data = fs.readFileSync(sessionPath, 'utf-8')
      const savedSession = JSON.parse(data) as Account

      if (savedSession && savedSession.uuid) {
        const valid = await auth.validate(savedSession)
        if (valid) {
          return { success: true, account: savedSession } as IAuthResponse
        }
        const account = await auth.refresh(savedSession)
        fs.writeFileSync(sessionPath, JSON.stringify(account))
        return { success: true, account } as IAuthResponse
      }
      return { success: false }
    } catch (err: any) {
      logger.error('Failed to refresh session:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath)
    }
    return { success: true }
  })

  return auth
}


