export {}

declare global {
  interface Window {
    krGate?: {
      version?: string
      nativeFetch?: (req: {
        url: string
        method?: string
        headers?: Record<string, string>
        body?: string | null
      }) => Promise<{
        ok: boolean
        status: number
        statusText: string
        headers: Record<string, string>
        body: string
      }>
    }
  }
}
