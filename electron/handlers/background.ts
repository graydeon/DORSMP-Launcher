import { ipcMain } from 'electron'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'

// Backgrounds uploaded in the AdminTool. CT514 publishes their public URLs (active one first) to
// files/carousel.json every minute; the AdminTool's own API only exposes the active one, under the admin host.
export function registerBackgroundHandlers() {
  ipcMain.handle('background:list', async (): Promise<string[]> => {
    try {
      const res = await fetch(`${ADMINTOOL_URL}/files/carousel.json`, { cache: 'no-store' })
      if (!res.ok) return []
      const data = (await res.json()) as { images?: unknown }
      return Array.isArray(data.images) ? data.images.filter((u): u is string => typeof u === 'string' && u.startsWith('https://')) : []
    } catch (err) {
      logger.error('Failed to fetch carousel backgrounds:', err)
      return []
    }
  })
}
