import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron'
import fs from 'fs'
import path from 'path'

function safeStringify(value: unknown): string {
  try {
    if (value instanceof Error) {
      return JSON.stringify(
        {
          name: value.name,
          message: value.message,
          stack: value.stack,
        },
        null,
        2,
      )
    }
    return JSON.stringify(value, null, 2)
  } catch {
    try {
      return String(value)
    } catch {
      return '[unprintable]'
    }
  }
}

function appendLog(line: string): void {
  try {
    const userData = app.getPath('userData')
    const logDir = path.join(userData, 'logs')
    const logFile = path.join(logDir, 'main.log')
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${line}\n`, { encoding: 'utf8' })
  } catch {
    // ignore logging failures
  }
}

function showFatalError(title: string, err: unknown): void {
  const detail = safeStringify(err)
  appendLog(`[fatal] ${title} ${detail}`)
  try {
    dialog.showMessageBoxSync({
      type: 'error',
      title,
      message: title,
      detail:
        detail +
        '\n\nLog file: %APPDATA%\\IDCS GATE\\logs\\main.log (or similar userData logs folder)',
    })
  } catch {
    // ignore
  }
}

process.on('uncaughtException', (err) => {
  showFatalError('IDCS GATE crashed (uncaught exception)', err)
})

process.on('unhandledRejection', (reason) => {
  showFatalError('IDCS GATE crashed (unhandled promise rejection)', reason)
})

// Register a secure, standard scheme so Web Serial works in production builds
// (file:// is not considered a secure context by Chromium).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

// Enable Web Serial in Electron/Chromium.
try {
  app.commandLine.appendSwitch('enable-experimental-web-platform-features')
  app.commandLine.appendSwitch('enable-features', 'WebSerial')
  app.commandLine.appendSwitch('enable-blink-features', 'Serial')
} catch {}

// Same USB-serial filters we use in the renderer, used here for automatic selection.
const SERIAL_FILTERS = [
  { usbVendorId: 0x1a86, usbProductId: 0x7523 },
  { usbVendorId: 0x1a86, usbProductId: 0x5523 },
  { usbVendorId: 0x1a86, usbProductId: 0x55d4 },
  { usbVendorId: 0x10c4, usbProductId: 0xea60 },
  { usbVendorId: 0x0403, usbProductId: 0x6001 },
  { usbVendorId: 0x0403, usbProductId: 0x6015 },
  { usbVendorId: 0x2341, usbProductId: 0x0043 },
  { usbVendorId: 0x2341, usbProductId: 0x0001 },
]

function matchesKnownSerial(port: any): boolean {
  try {
    const vendorId = Number(port?.vendorId)
    const productId = Number(port?.productId)
    if (!vendorId) return false
    return SERIAL_FILTERS.some((f) => f.usbVendorId === vendorId && f.usbProductId === productId)
  } catch {
    return false
  }
}

let mainWindow: BrowserWindow | null = null

const PROD_ALLOWED_API_HOSTS = String(process.env.KR_GATE_ALLOWED_API_HOSTS || 'gate.krgi.co.in')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

function isAllowedApiUrl(rawUrl: string): boolean {
  try {
    const url = new URL(String(rawUrl))
    const isHttpsProd =
      url.protocol === 'https:' && PROD_ALLOWED_API_HOSTS.includes(String(url.hostname || '').toLowerCase())

    if (app.isPackaged) return isHttpsProd

    const isLocalDev = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    return isHttpsProd || isLocalDev
  } catch {
    return false
  }
}

type NativeFetchRequest = {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string | null
}

type NativeFetchResponse = {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
}

ipcMain.handle('nativeFetch', async (_event, req: NativeFetchRequest): Promise<NativeFetchResponse> => {
  const url = String(req?.url || '')
  if (!isAllowedApiUrl(url)) {
    return {
      ok: false,
      status: 0,
      statusText: 'Blocked URL',
      headers: {},
      body: JSON.stringify({ detail: 'Blocked URL' }),
    }
  }

  const method = String(req?.method || 'GET').toUpperCase()
  const headers = req?.headers || {}
  const body = typeof req?.body === 'string' ? req.body : ''

  return await new Promise<NativeFetchResponse>((resolve) => {
    try {
      const request = net.request({ method, url })

      for (const [k, v] of Object.entries(headers)) {
        try {
          request.setHeader(k, v)
        } catch {}
      }

      request.on('response', (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
        response.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const resHeaders: Record<string, string> = {}
          try {
            for (const [k, v] of Object.entries(response.headers || {})) {
              if (Array.isArray(v)) resHeaders[k] = v.join(', ')
              else if (typeof v === 'string') resHeaders[k] = v
              else if (typeof v === 'number') resHeaders[k] = String(v)
            }
          } catch {}

          const status = Number(response.statusCode || 0)
          resolve({
            ok: status >= 200 && status < 300,
            status,
            statusText: String(response.statusMessage || ''),
            headers: resHeaders,
            body: buffer.toString('utf8'),
          })
        })
      })

      request.on('error', (err) => {
        resolve({
          ok: false,
          status: 0,
          statusText: String((err as any)?.message || 'Network error'),
          headers: {},
          body: JSON.stringify({ detail: String((err as any)?.message || 'Network error') }),
        })
      })

      if (body && method !== 'GET' && method !== 'HEAD') request.write(body)
      request.end()
    } catch (err: any) {
      resolve({
        ok: false,
        status: 0,
        statusText: String(err?.message || 'Network error'),
        headers: {},
        body: JSON.stringify({ detail: String(err?.message || 'Network error') }),
      })
    }
  })
})

function createWindow() {
  appendLog('[startup] createWindow()')
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      experimentalFeatures: true,
      enableBlinkFeatures: 'Serial',
    },
  })

  // Start maximized but keep standard window controls (min/max/close).
  try {
    mainWindow.maximize()
  } catch {}

  // WebSerial permission + selection handling.
  // Without this, requestPort() can hang / never resolve in Electron.
  try {
    const ses = mainWindow.webContents.session

    ses.setPermissionRequestHandler((_, permission, callback) => {
      const p = String(permission as any)
      if (p === 'serial' || p === 'usb') return callback(true)
      return callback(false)
    })

    ses.setPermissionCheckHandler((_, permission) => {
      const p = String(permission as any)
      return p === 'serial' || p === 'usb'
    })

    // Explicitly allow serial device access.
    try {
      const sessionWithDevicePermission = ses as any
      sessionWithDevicePermission.setDevicePermissionHandler?.((details: any) => {
        return details?.deviceType === 'serial'
      })
    } catch {}

    // Show a selection popup when the renderer requests a serial port.
    ses.on('select-serial-port', (event: any, portList: any[], _webContents: any, callback: (portId: string) => void) => {
      event.preventDefault()

      ;(async () => {
        try {
          if (!Array.isArray(portList) || portList.length === 0) {
            // eslint-disable-next-line no-console
            console.warn('[serial] no ports found')
            dialog.showMessageBox(mainWindow!, {
              type: 'warning',
              title: 'No USB Devices Found',
              message: 'No compatible USB serial devices were detected.',
              detail: 'Please ensure the scanner is plugged in and the USB drivers (CH340 / CP210x) are properly installed.'
            })
            callback('')
            return
          }

          const items = portList.map((p, idx) => {
            const name = String(p?.displayName || 'Serial device')
            const vid = p?.vendorId ? String(p.vendorId) : ''
            const pid = p?.productId ? String(p.productId) : ''
            const suffix = vid || pid ? ` (${vid}${vid && pid ? ':' : ''}${pid})` : ''
            return `${idx + 1}. ${name}${suffix}`
          })

          const defaultId = Math.max(
            0,
            portList.findIndex((p) => matchesKnownSerial(p)),
          )

          const result = await dialog.showMessageBox(mainWindow!, {
            type: 'question',
            title: 'Select USB Scanner',
            message: 'Select the USB serial scanner device:',
            detail: items.join('\n'),
            buttons: [...portList.map((p) => String(p?.displayName || 'Serial device')), 'Cancel'],
            defaultId,
            cancelId: portList.length,
            noLink: true,
          })

          if (result.response >= 0 && result.response < portList.length) {
            const chosen = portList[result.response]
            // eslint-disable-next-line no-console
            console.log('[serial] selected:', {
              portId: chosen?.portId,
              vendorId: chosen?.vendorId,
              productId: chosen?.productId,
              displayName: chosen?.displayName,
            })
            callback(chosen?.portId || '')
            return
          }

          callback('')
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[serial] selection popup failed', e)
          callback('')
        }
      })()
    })
  } catch {}

  // Basic runtime diagnostics (useful for kiosk deployments).
  try {
    mainWindow.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      // eslint-disable-next-line no-console
      console.log(`[renderer console:${level}] ${message} (${sourceId}:${line})`)
      appendLog(`[renderer console:${level}] ${message} (${sourceId}:${line})`)
    })
    mainWindow.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
      // eslint-disable-next-line no-console
      console.error(`[renderer load failed] ${errorCode} ${errorDescription} ${validatedURL}`)
      appendLog(`[renderer load failed] ${errorCode} ${errorDescription} ${validatedURL}`)
    })
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      // eslint-disable-next-line no-console
      console.error('[renderer process gone]', details)
      appendLog(`[renderer process gone] ${safeStringify(details)}`)
    })
  } catch {}

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadURL('app://-/index.html')
  }
}

app.whenReady().then(() => {
  try {
    // Map app:// URLs to the renderer output folder.
    protocol.registerFileProtocol('app', (request, callback) => {
      try {
        const url = new URL(request.url)
        let pathname = decodeURIComponent(url.pathname)
        if (!pathname || pathname === '/') pathname = '/index.html'
        const base = path.join(__dirname, '../renderer')
        const resolved = path.join(base, pathname)
        callback({ path: resolved })
      } catch {
        callback({ path: path.join(__dirname, '../renderer/index.html') })
      }
    })
  } catch {}

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
