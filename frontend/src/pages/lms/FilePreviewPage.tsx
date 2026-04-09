import React, { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { getMaterialPreviewFile } from '../../services/lms'

type PreviewMode = 'loading' | 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'html' | 'pptx-text' | 'unsupported' | 'error'

type PreviewState = {
  mode: PreviewMode
  title: string
  contentType: string
  objectUrl?: string
  textContent?: string
  htmlContent?: string
  slides?: string[]
  error?: string
}

function decodeXmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function getExtension(name: string): string {
  const n = String(name || '').toLowerCase()
  const idx = n.lastIndexOf('.')
  return idx >= 0 ? n.slice(idx) : ''
}

function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function worksheetToHtml(sheet: XLSX.WorkSheet | null): string {
  if (!sheet) return '<p>No worksheet found.</p>'
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as Array<Array<string | number | boolean | null>>
  if (!rows.length) return '<p>No worksheet rows found.</p>'

  const body = rows
    .map((row) => {
      const cols = (row || [])
        .map((cell) => `<td style="border:1px solid #d1d5db;padding:6px;vertical-align:top;">${escapeHtml(String(cell ?? ''))}</td>`)
        .join('')
      return `<tr>${cols}</tr>`
    })
    .join('')

  return `<div style="overflow:auto;"><table style="border-collapse:collapse;width:100%;font-size:13px;">${body}</table></div>`
}

async function extractPptxSlideTexts(buffer: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer)
  const slideFiles = Object.keys(zip.files)
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/i.test(k))
    .sort((a, b) => {
      const na = Number((a.match(/slide(\d+)\.xml/i) || [])[1] || 0)
      const nb = Number((b.match(/slide(\d+)\.xml/i) || [])[1] || 0)
      return na - nb
    })

  const slides: string[] = []
  for (const file of slideFiles) {
    const xml = await zip.file(file)?.async('text')
    if (!xml) {
      slides.push('')
      continue
    }
    const texts: string[] = []
    const regex = /<a:t>([\s\S]*?)<\/a:t>/g
    let m: RegExpExecArray | null = null
    while ((m = regex.exec(xml)) !== null) {
      texts.push(decodeXmlEntities(m[1] || ''))
    }
    slides.push(texts.join('\n').trim())
  }
  return slides
}

export default function FilePreviewPage() {
  const { materialId } = useParams<{ materialId: string }>()
  const [state, setState] = useState<PreviewState>({ mode: 'loading', title: 'Preview', contentType: '' })

  useEffect(() => {
    let active = true
    let createdUrl: string | null = null

    async function run() {
      const id = Number(materialId)
      if (!Number.isFinite(id) || id <= 0) {
        setState({ mode: 'error', title: 'Preview', contentType: '', error: 'Invalid material id.' })
        return
      }

      setState({ mode: 'loading', title: 'Preparing preview...', contentType: '' })

      try {
        const { blob, contentType, filename } = await getMaterialPreviewFile(id)
        if (!active) return

        const ext = getExtension(filename)
        const lowerType = String(contentType || '').toLowerCase()

        if (lowerType.includes('pdf') || ext === '.pdf') {
          createdUrl = URL.createObjectURL(blob)
          setState({ mode: 'pdf', title: filename, contentType, objectUrl: createdUrl })
          return
        }

        if (lowerType.startsWith('image/')) {
          createdUrl = URL.createObjectURL(blob)
          setState({ mode: 'image', title: filename, contentType, objectUrl: createdUrl })
          return
        }

        if (lowerType.startsWith('video/')) {
          createdUrl = URL.createObjectURL(blob)
          setState({ mode: 'video', title: filename, contentType, objectUrl: createdUrl })
          return
        }

        if (lowerType.startsWith('audio/')) {
          createdUrl = URL.createObjectURL(blob)
          setState({ mode: 'audio', title: filename, contentType, objectUrl: createdUrl })
          return
        }

        if (ext === '.docx') {
          const result = await mammoth.convertToHtml({ arrayBuffer: await blob.arrayBuffer() })
          if (!active) return
          setState({ mode: 'html', title: filename, contentType, htmlContent: result.value || '<p>No content</p>' })
          return
        }

        if (ext === '.xlsx' || ext === '.xls') {
          const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' })
          const first = wb.SheetNames[0]
          const sheet = first ? wb.Sheets[first] : null
          const html = worksheetToHtml(sheet || null)
          if (!active) return
          setState({ mode: 'html', title: filename, contentType, htmlContent: html })
          return
        }

        if (ext === '.pptx') {
          const slides = await extractPptxSlideTexts(await blob.arrayBuffer())
          if (!active) return
          setState({ mode: 'pptx-text', title: filename, contentType, slides })
          return
        }

        if (lowerType.startsWith('text/') || ['.txt', '.csv', '.json', '.xml', '.md', '.log'].includes(ext)) {
          const text = await blob.text()
          if (!active) return
          setState({ mode: 'text', title: filename, contentType, textContent: text })
          return
        }

        createdUrl = URL.createObjectURL(blob)
        setState({ mode: 'unsupported', title: filename, contentType, objectUrl: createdUrl })
      } catch (e: any) {
        if (!active) return
        setState({ mode: 'error', title: 'Preview', contentType: '', error: e?.message || 'Failed to render preview.' })
      }
    }

    run()

    return () => {
      active = false
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [materialId])

  const header = useMemo(() => {
    if (state.mode === 'loading') return 'Preparing preview...'
    return state.title || 'File Preview'
  }, [state])

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg md:text-xl font-semibold">{header}</h1>
          <Link to="/lms" className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-white">
            Back to LMS
          </Link>
        </div>

        {state.mode === 'loading' ? <div className="text-sm text-slate-600">Loading file...</div> : null}
        {state.mode === 'error' ? <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error || 'Preview error'}</div> : null}

        {state.mode === 'pdf' && state.objectUrl ? (
          <iframe title="PDF preview" src={state.objectUrl} className="w-full h-[82vh] rounded-lg border border-slate-200 bg-white" />
        ) : null}

        {state.mode === 'image' && state.objectUrl ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <img src={state.objectUrl} alt={state.title} className="max-w-full h-auto" />
          </div>
        ) : null}

        {state.mode === 'video' && state.objectUrl ? (
          <video src={state.objectUrl} controls className="w-full max-h-[82vh] rounded-lg border border-slate-200 bg-black" />
        ) : null}

        {state.mode === 'audio' && state.objectUrl ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <audio src={state.objectUrl} controls className="w-full" />
          </div>
        ) : null}

        {state.mode === 'text' ? (
          <pre className="rounded-lg border border-slate-200 bg-white p-3 overflow-auto text-sm whitespace-pre-wrap">{state.textContent || ''}</pre>
        ) : null}

        {state.mode === 'html' ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4 overflow-auto prose max-w-none" dangerouslySetInnerHTML={{ __html: state.htmlContent || '' }} />
        ) : null}

        {state.mode === 'pptx-text' ? (
          <div className="space-y-3">
            {(state.slides || []).length === 0 ? <div className="text-sm text-slate-600">No readable slide text found.</div> : null}
            {(state.slides || []).map((s, i) => (
              <section key={i} className="rounded-lg border border-slate-200 bg-white p-3">
                <h2 className="font-medium mb-2">Slide {i + 1}</h2>
                <pre className="text-sm whitespace-pre-wrap">{s || '(No text on this slide)'}</pre>
              </section>
            ))}
          </div>
        ) : null}

        {state.mode === 'unsupported' && state.objectUrl ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
            <div>Inline preview is not available for this file type in browser.</div>
            <a href={state.objectUrl} download={state.title} className="inline-block rounded-md border border-amber-500 px-3 py-1.5 hover:bg-amber-100">
              Download File
            </a>
          </div>
        ) : null}
      </div>
    </div>
  )
}
