import { ipcMain } from 'electron'
import { Maintenance } from 'eml-lib'
import type { Account } from 'eml-lib'
import logger from 'electron-log/main'
import { ADMINTOOL_URL } from '../const'

export function registerMaintenanceHandlers() {
  // The account's name lets the AdminTool answer canBypass for players on the maintenance allow list.
  ipcMain.handle('maintenance:get', async (_event, account?: Account) => {
    try {
      const status = await new Maintenance(ADMINTOOL_URL, account).getMaintenance()
      const now = new Date()
      if (!status?.startTime || new Date(status.startTime) > now) return null
      if (status.endTime && new Date(status.endTime) <= now) return null
      return status
    } catch (err) {
      logger.error('Failed to fetch maintenance:', err)
      return null
    }
  })
}
