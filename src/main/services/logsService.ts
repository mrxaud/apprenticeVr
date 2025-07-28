import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, unlinkSync } from 'fs'
import SevenZip from 'node-7z'
import dependencyService from './dependencyService'
import { LogsAPI } from '@shared/types'

class LogsService implements LogsAPI {
  public getLogFilePath(): string {
    return join(join(app.getPath('userData'), 'logs'), 'main.log')
  }

  async uploadCurrentLog(): Promise<{ url: string; password: string } | null> {
    const logFilePath = this.getLogFilePath()

    if (!existsSync(logFilePath)) {
      console.error('[LogsService] Log file not found at:', logFilePath)
      return null
    }

    // Create temporary zip file path
    const zipFilePath = join(app.getPath('userData'), 'temp-log.zip')

    try {
      console.log('[LogsService] Compressing log file...')

      // Remove existing zip file if it exists
      if (existsSync(zipFilePath)) {
        unlinkSync(zipFilePath)
      }

      // Check if 7zip is ready
      if (!dependencyService.getStatus().sevenZip.ready) {
        throw new Error('7zip is not available. Cannot compress log file.')
      }

      // Compress the log file using SevenZip
      await new Promise<void>((resolve, reject) => {
        const myStream = SevenZip.add(zipFilePath, logFilePath, {
          $bin: dependencyService.get7zPath()
        })

        myStream.on('end', () => {
          console.log('[LogsService] Log file compressed successfully')
          resolve()
        })

        myStream.on('error', (error) => {
          console.error('[LogsService] Compression error:', error)
          reject(error)
        })
      })

      console.log('[LogsService] Uploading compressed log file to catbox.moe...')

      // Read the compressed file content
      const zipContent = readFileSync(zipFilePath)

      // Create FormData for catbox upload
      const formData = new FormData()
      formData.append('userhash', '') // Empty userhash for anonymous upload
      formData.append('reqtype', 'fileupload')

      // Create a Blob for the zip file content and append it
      const fileBlob = new Blob([zipContent], { type: 'application/zip' })
      formData.append('fileToUpload', fileBlob, 'apprenticevr-main.log.zip')

      // Upload to catbox.moe
      const response = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        body: formData
      })

      if (response.ok) {
        // Catbox returns the URL directly as plain text
        const shareableUrl = await response.text()
        console.log('[LogsService] Compressed log file uploaded successfully:', shareableUrl)
        return { url: shareableUrl.trim(), password: '' } // No password needed for catbox
      } else {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      console.error('[LogsService] Failed to compress or upload log file:', error)
      return null
    } finally {
      // Clean up temporary zip file
      if (existsSync(zipFilePath)) {
        try {
          unlinkSync(zipFilePath)
          console.log('[LogsService] Temporary zip file cleaned up')
        } catch (cleanupError) {
          console.warn('[LogsService] Failed to clean up temporary zip file:', cleanupError)
        }
      }
    }
  }
}

export default new LogsService()
