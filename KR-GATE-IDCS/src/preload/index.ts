import { contextBridge, ipcRenderer } from 'electron'

// Reserved for future IPC (sync, storage, device integration).
contextBridge.exposeInMainWorld('krGate', {
  version: '0.1.1',
  nativeFetch: (req: { url: string; method?: string; headers?: Record<string, string>; body?: string | null }) => {
    return ipcRenderer.invoke('nativeFetch', req)
  },
})
