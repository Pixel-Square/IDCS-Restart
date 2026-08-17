import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import {
  Play, Send, X, ChevronLeft, Lock, FolderOpen,
  CheckCircle, XCircle, Clock, AlertCircle,
  Square, RefreshCw, ExternalLink, Globe, Loader,
} from 'lucide-react'
import { assessmentsApi, executionsApi, projectsApi } from '../../api'
import FileTree, { TreeNode } from '../../components/FileTree'

type RunStatus = 'idle' | 'running' | 'done' | 'error'
type ExecStatus = 'idle' | 'queued' | 'building' | 'starting' | 'running' | 'failed' | 'stopped' | 'expired'

interface FileState {
  id: number
  name: string
  path: string
  content: string
  is_locked: boolean
}

interface TestResult {
  test_case_id?: number
  passed: boolean
  is_hidden: boolean
  marks_awarded: number
  actual_output?: string
  expected_output?: string
  error?: string
  execution_time_ms?: number
}

export default function StudentIDE() {
  const { assessmentId } = useParams<{ assessmentId: string }>()
  const navigate = useNavigate()
  const id = Number(assessmentId)

  const [assessment, setAssessment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Virtual filesystem tree
  const [vfsTree, setVfsTree] = useState<TreeNode[]>([])
  
  // Cache map for fast lookup of files by ID
  const [rawFilesMap, setRawFilesMap] = useState<Record<number, FileState>>({})
  
  // Tab management for opened files
  const [openTabs, setOpenTabs] = useState<number[]>([]) // array of file IDs
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null)

  // Editor states (stores current session-wide student code changes)
  const [fileContents, setFileContents] = useState<Record<number, string>>({})
  const editorRef = useRef<any>(null)

  // Console execution
  const [terminalOutput, setTerminalOutput] = useState<string[]>([])
  const [runStatus, setRunStatus] = useState<RunStatus>('idle')
  const [testResults, setTestResults] = useState<TestResult[]>([])
  const [score, setScore] = useState<{ score: number; total: number; passed: number; failed: number } | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [submissionStatus, setSubmissionStatus] = useState('')
  const [panelTab, setPanelTab] = useState<'output' | 'testcases' | 'buildlog' | 'runlog'>('output')

  // Web preview / execution
  const [execStatus, setExecStatus] = useState<ExecStatus>('idle')
  const [execSession, setExecSession] = useState<any>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const isSingleFile = assessment?.coding_project?.workspace_type === 'SINGLE_FILE'
  const isWebProject = assessment?.coding_project?.preview_enabled === true

  // Resizable Panels State
  const [fileTreeWidth, setFileTreeWidth] = useState(Number(localStorage.getItem('coder.fileTreeWidth')) || 280)
  const [previewWidth, setPreviewWidth] = useState(Number(localStorage.getItem('coder.previewWidth')) || 380)
  const [terminalHeight, setTerminalHeight] = useState(Number(localStorage.getItem('coder.terminalHeight')) || 180)

  const [isResizingFileTree, setIsResizingFileTree] = useState(false)
  const [isResizingPreview, setIsResizingPreview] = useState(false)
  const [isResizingTerminal, setIsResizingTerminal] = useState(false)

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingFileTree) {
        const newWidth = Math.max(220, Math.min(450, e.clientX))
        setFileTreeWidth(newWidth)
        localStorage.setItem('coder.fileTreeWidth', newWidth.toString())
      } else if (isResizingPreview) {
        const newWidth = Math.max(300, Math.min(700, window.innerWidth - e.clientX))
        setPreviewWidth(newWidth)
        localStorage.setItem('coder.previewWidth', newWidth.toString())
      } else if (isResizingTerminal) {
        const newHeight = Math.max(80, Math.min(500, window.innerHeight - e.clientY))
        setTerminalHeight(newHeight)
        localStorage.setItem('coder.terminalHeight', newHeight.toString())
      }
    }
    const handleMouseUp = () => {
      setIsResizingFileTree(false)
      setIsResizingPreview(false)
      setIsResizingTerminal(false)
    }

    if (isResizingFileTree || isResizingPreview || isResizingTerminal) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingFileTree, isResizingPreview, isResizingTerminal])

  // Derive language string for API calls
  const getLanguage = () => {
    const project = assessment?.coding_project
    if (project?.workspace_type === 'SINGLE_FILE') return project.single_file_language || 'java'
    const langs = project?.supported_languages || []
    return langs[0]?.replace('.', '') || 'java'
  }

  const log = (msg: string) => setTerminalOutput(prev => [...prev, msg])

  const loadTree = async () => {
    try {
      const treeRes = await projectsApi.getTree(id)
      setVfsTree(treeRes.data.children || [])
    } catch (e) {
      console.error('Failed to load project tree', e)
    }
  }

  useEffect(() => {
    assessmentsApi.studentGet(id)
      .then(async r => {
        setAssessment(r.data)
        const projectFiles: FileState[] = r.data.project_files || []
        
        // Cache files map
        const fMap: Record<number, FileState> = {}
        const contents: Record<number, string> = {}
        projectFiles.forEach((f: FileState) => { 
          fMap[f.id] = f 
          contents[f.id] = f.content
        })
        setRawFilesMap(fMap)
        setFileContents(contents)

        await loadTree()

        if (projectFiles.length > 0) {
          // Open first file automatically
          setSelectedFileId(projectFiles[0].id)
          setOpenTabs([projectFiles[0].id])
        }

        if (r.data.end_time) {
          const diff = Math.floor((new Date(r.data.end_time).getTime() - Date.now()) / 1000)
          if (diff > 0) setTimeLeft(diff)
        } else if (r.data.duration_minutes) {
          setTimeLeft(r.data.duration_minutes * 60)
        }
      })
      .catch(e => setError(e?.response?.data?.detail || 'Could not load assessment'))
      .finally(() => setLoading(false))
  }, [id])

  // Countdown timer
  useEffect(() => {
    if (timeLeft === null) return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) { clearInterval(timerRef.current!); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [timeLeft !== null])

  // Cleanup poll on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // Get full flat snapshot of the project structure with modifications
  const getFileSnapshot = useCallback(() => {
    const snapshot: Record<string, string> = {}
    Object.values(rawFilesMap).forEach((f: any) => {
      // Find full virtual path for execution workspace sync
      const fullPath = f.path || f.name
      snapshot[fullPath] = fileContents[f.id] ?? f.content
    })
    return snapshot
  }, [rawFilesMap, fileContents])

  // ── Console Run ───────────────────────────────────────────────────────────
  const handleRun = async () => {
    if (runStatus === 'running') return
    setRunStatus('running')
    setTerminalOutput(['⚙ Compiling and running...'])
    setPanelTab('output')
    setTestResults([])
    setScore(null)
    try {
      const snapshot = getFileSnapshot()
      const language = getLanguage()
      const res = await assessmentsApi.runCode(id, snapshot, language)
      const data = res.data
      
      const results: any[] = data.results || []
      if (results.length === 0) {
        // No public test cases — show raw stdout/stderr
        const lines: string[] = ['✓ Compilation done', '⚙ Running...', '']
        if (data.stdout) lines.push(...data.stdout.split('\n'))
        if (data.stderr) { lines.push('', '─── stderr ───', ...data.stderr.split('\n')) }
        lines.push('', `Exit: ${data.exit_code ?? 0} · ${data.execution_time_ms ?? 0}ms`)
        if (!data.stdout && !data.stderr) lines.push('(no output)')
        setTerminalOutput(lines)
        setPanelTab('output')
      } else {
        const passed = results.filter(r => r.passed).length
        const lines: string[] = [
          '✓ Compilation done',
          '⚙ Running against public test cases...',
          '',
        ]
        results.forEach((r, i) => {
          lines.push(`── Test ${i + 1} ${r.passed ? '✅ PASS' : '❌ FAIL'} (${r.execution_time_ms ?? 0}ms)`)
          if (r.input) lines.push(`   Input: ${r.input.trim()}`)
          lines.push(`   Expected: ${r.expected?.trim() ?? ''}`)
          lines.push(`   Got:      ${r.actual?.trim() ?? ''}`)
          if (r.stderr) lines.push(`   stderr: ${r.stderr.trim()}`)
          lines.push('')
        })
        lines.push(`── ${passed}/${results.length} test(s) passed`)
        setTerminalOutput(lines)
        setTestResults(results.map((r: any) => ({
          passed: r.passed,
          is_hidden: false,
          marks_awarded: 0,
          actual_output: r.actual,
          expected_output: r.expected,
          error: r.stderr,
          execution_time_ms: r.execution_time_ms,
        })))
        setPanelTab('testcases')
      }
      setRunStatus('done')
    } catch (e: any) {
      const errData = e?.response?.data
      const msg = errData?.stderr || errData?.detail || 'Unknown error'
      setTerminalOutput(['', `✗ Error: ${msg}`])
      setRunStatus('error')
    }
  }

  // ── Web Run ───────────────────────────────────────────────────────────────
  const handleWebRun = async () => {
    if (execStatus === 'building' || execStatus === 'starting' || execStatus === 'queued') return
    setExecStatus('queued')
    setExecSession(null)
    setTerminalOutput(['📦 Preparing workspace...'])
    setPanelTab('buildlog')

    const snapshot = getFileSnapshot()

    try {
      const res = await executionsApi.start(id, snapshot)
      const session = res.data
      setExecSession(session)
      setExecStatus('queued')
      setTerminalOutput(['📦 Queued — waiting for build server...'])
      startPolling(session.id)
    } catch (e: any) {
      setExecStatus('failed')
      setTerminalOutput(['✗ Failed to start execution: ' + (e?.response?.data?.detail || 'Unknown error')])
    }
  }



  const startPolling = (sessionId: number) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const res = await executionsApi.status(sessionId)
        const session = res.data
        setExecSession(session)
        // Backend returns uppercase status (BUILDING, STARTING, RUNNING, FAILED, etc.)
        // Normalise to lowercase to match our ExecStatus type.
        const s = (session.status as string).toLowerCase() as ExecStatus

        if (s === 'queued') {
          setExecStatus('queued')
          // Just waiting — no log update needed
        } else if (s === 'building') {
          setExecStatus('building')
          const buildLines = session.build_log
            ? ['🔨 Building project...', '', ...session.build_log.split('\n')]
            : ['🔨 Building project...']
          setTerminalOutput(buildLines)
          setPanelTab('buildlog')
        } else if (s === 'starting') {
          setExecStatus('starting')
          setTerminalOutput([
            '✓ Build complete!',
            '',
            '🚀 Starting application...',
            ...(session.run_log ? session.run_log.split('\n') : []),
          ])
          setPanelTab('runlog')
        } else if (s === 'running') {
          setExecStatus('running')
          setTerminalOutput([
            '✓ Build complete!',
            '',
            '─── Application Log ───',
            ...(session.run_log ? session.run_log.split('\n') : []),
            '',
            '✓ Application is running!',
          ])
          setPanelTab('runlog')
          clearInterval(pollRef.current!)
          pollRef.current = null
        } else if (s === 'failed') {
          setExecStatus('failed')
          setTerminalOutput([
            ...(session.build_log ? ['─── Build Log ───', ...session.build_log.split('\n'), ''] : []),
            ...(session.run_log ? ['─── Run Log ───', ...session.run_log.split('\n'), ''] : []),
            '',
            '❌ Build/Start failed. See logs above.',
          ])
          setPanelTab('buildlog')
          clearInterval(pollRef.current!)
          pollRef.current = null
        } else if (s === 'stopped' || s === 'expired') {
          setExecStatus('stopped')
          setTerminalOutput([`⏹ Session ${s}.`])
          clearInterval(pollRef.current!)
          pollRef.current = null
        }
      } catch {
        // polling error — keep retrying
      }
    }, 1500)
  }

  const handleWebStop = async () => {
    if (!execSession) return
    try {
      await executionsApi.stop(execSession.id)
      if (pollRef.current) clearInterval(pollRef.current)
      setExecStatus('stopped')
      setExecSession((prev: any) => ({ ...prev, status: 'stopped' }))
    } catch { /* ignore */ }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!confirm('Submit your code for final evaluation?')) return
    setRunStatus('running')
    setTerminalOutput(['⚙ Submitting...'])
    setPanelTab('output')
    setTestResults([])
    setScore(null)
    try {
      const snapshot = getFileSnapshot()
      const language = getLanguage()
      const res = await assessmentsApi.submitCode(id, snapshot, language)
      const data = res.data
      setScore({ score: data.score, total: data.total_score, passed: data.passed_tests, failed: data.failed_tests })
      setTestResults(data.result_details || [])
      setPanelTab('testcases')
      setSubmitted(true)
      setSubmissionStatus(data.status)
      setTerminalOutput(['✓ Submitted successfully'])
      setRunStatus('done')
    } catch (e: any) {
      setTerminalOutput(['✗ Submission failed: ' + (e?.response?.data?.detail || 'Unknown error')])
      setRunStatus('error')
    }
  }

  const getEditorLang = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = {
      java: 'java', py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
      c: 'c', cpp: 'cpp', cs: 'csharp', go: 'go', rs: 'rust',
      html: 'html', css: 'css', json: 'json', xml: 'xml',
      yaml: 'yaml', yml: 'yaml', properties: 'properties', md: 'markdown',
      sql: 'sql', sh: 'shell',
    }
    return map[ext || ''] || 'plaintext'
  }

  // ── Multi-Tab Operations ──
  const handleOpenTab = (node: TreeNode) => {
    const file = Object.values(rawFilesMap).find(f => f.path === node.path)
    if (file) {
      if (!openTabs.includes(file.id)) {
        setOpenTabs(prev => [...prev, file.id])
      }
      setSelectedFileId(file.id)
    }
  }

  const handleCloseTab = (e: React.MouseEvent, tabId: number) => {
    e.stopPropagation()
    const remaining = openTabs.filter(tid => tid !== tabId)
    setOpenTabs(remaining)
    if (selectedFileId === tabId) {
      setSelectedFileId(remaining.length > 0 ? remaining[remaining.length - 1] : null)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-base)' }}>
      <div className="spinner" style={{ width: 36, height: 36 }} />
    </div>
  )

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-base)', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <AlertCircle size={48} color="var(--accent-red)" style={{ marginBottom: '1rem' }} />
        <h2 style={{ marginBottom: '0.5rem' }}>{error}</h2>
        <Link to="/student" className="btn btn-primary" style={{ marginTop: '1rem' }}>
          <ChevronLeft size={15} /> Back to Dashboard
        </Link>
      </div>
    </div>
  )

  const timerDanger = timeLeft !== null && timeLeft < 300
  const previewUrl = execSession?.preview_url
  
  // Current active file info
  const activeFile = selectedFileId !== null ? rawFilesMap[selectedFileId] : null

  // Determine which panel tabs to show
  const bottomTabs = isWebProject
    ? [
        { key: 'buildlog', label: '🔨 Build' },
        { key: 'runlog', label: '🚀 App Log' },
        { key: 'testcases', label: '✓ Tests' },
      ]
    : [
        { key: 'output', label: '🖥 Output' },
        { key: 'testcases', label: '✓ Tests' },
      ]

  return (
    <div className="ide-layout" style={isWebProject ? { gridTemplateColumns: '220px 1fr 300px' } as any : undefined}>
      {/* ── Top bar ── */}
      <div className="ide-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
          <Link to={`/student/assessments/${id}`} className="btn btn-ghost btn-sm">
            <ChevronLeft size={15} />
          </Link>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <div>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{assessment?.title}</span>
            <span className="badge badge-brand" style={{ marginLeft: 8, fontSize: '0.7rem' }}>
              {isWebProject ? 'WEB' : 'CODING'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Timer */}
          {timeLeft !== null && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.3rem 0.75rem',
              borderRadius: 6,
              background: timerDanger ? 'rgba(248,81,73,0.15)' : 'var(--bg-elevated)',
              border: `1px solid ${timerDanger ? 'rgba(248,81,73,0.4)' : 'var(--border)'}`,
              fontFamily: 'var(--font-mono)', fontSize: '0.875rem',
              color: timerDanger ? 'var(--accent-red)' : 'var(--text-primary)',
            }}>
              <Clock size={14} />
              {formatTime(timeLeft)}
            </div>
          )}

          {submitted && score && (
            <div style={{
              padding: '0.3rem 0.875rem',
              background: score.score >= score.total * 0.6 ? 'rgba(63,185,80,0.15)' : 'rgba(248,81,73,0.15)',
              border: `1px solid ${score.score >= score.total * 0.6 ? 'rgba(63,185,80,0.4)' : 'rgba(248,81,73,0.4)'}`,
              borderRadius: 6, fontSize: '0.875rem', fontWeight: 600,
              color: score.score >= score.total * 0.6 ? 'var(--accent-green)' : 'var(--accent-red)',
            }}>
              {score.score} / {score.total}
            </div>
          )}

          {isWebProject ? (
            <>
              <button
                className="btn btn-success btn-sm"
                onClick={handleWebRun}
                disabled={execStatus === 'building' || execStatus === 'starting' || execStatus === 'queued'}
                title="Build and run application"
              >
                {(execStatus === 'building' || execStatus === 'starting' || execStatus === 'queued')
                  ? <div className="spinner" style={{ width: 14, height: 14 }} />
                  : <Play size={14} />}
                {execStatus === 'building' ? 'Building...' : execStatus === 'starting' ? 'Starting...' : execStatus === 'queued' ? 'Queued...' : 'Run'}
              </button>
              {(execStatus === 'running' || execStatus === 'building' || execStatus === 'starting') && (
                <button className="btn btn-danger btn-sm" onClick={handleWebStop} title="Stop application">
                  <Square size={14} /> Stop
                </button>
              )}
            </>
          ) : (
            <button className="btn btn-success btn-sm" onClick={handleRun} disabled={runStatus === 'running'}>
              {runStatus === 'running' ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Play size={14} />}
              Run
            </button>
          )}

          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={runStatus === 'running' || submitted}>
            <Send size={14} />
            {submitted ? 'Submitted' : 'Submit'}
          </button>
        </div>
      </div>

      {/* ── IDE body Wrapper ── */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        <div className="ide-body" style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* VFS Explorer Panel */}
          <div className="ide-explorer" style={{ display: 'flex', flexDirection: 'column', width: fileTreeWidth, flexShrink: 0 }}>
            <FileTree 
              tree={vfsTree}
              selectedFileId={selectedFileId}
              onSelectFile={handleOpenTab}
              readOnly={true}
            />
          </div>

          <div className="ide-resizer-v" onMouseDown={() => setIsResizingFileTree(true)} />

          {/* Editor Area with Tab Bar */}
          <div className="ide-editor" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            {/* Tab bar header */}
            {openTabs.length > 0 && (
              <div style={{
                height: 36, display: 'flex', alignItems: 'center',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-surface)',
                overflowX: 'auto',
                flexShrink: 0
              }}>
                {openTabs.map(tabId => {
                  const f = rawFilesMap[tabId]
                  if (!f) return null
                  const isTabActive = selectedFileId === tabId
                  return (
                    <div
                      key={tabId}
                      onClick={() => setSelectedFileId(tabId)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.375rem',
                        padding: '0 0.75rem', height: '100%',
                        background: isTabActive ? 'var(--bg-base)' : 'transparent',
                        borderRight: '1px solid var(--border)',
                        fontSize: '0.78rem', fontFamily: 'var(--font-mono)',
                        color: isTabActive ? 'var(--text-primary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        borderTop: isTabActive ? '2px solid var(--brand)' : 'none'
                      }}
                    >
                      {f.is_locked && <Lock size={10} color="var(--accent-yellow)" />}
                      <span>{f.name}</span>
                      <button 
                        style={{ background: 'none', border: 'none', padding: 2, display: 'flex', alignItems: 'center', color: 'inherit', cursor: 'pointer' }}
                        onClick={(e) => handleCloseTab(e, tabId)}
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Active Document Editor */}
            {activeFile ? (
              <div style={{ flex: 1 }}>
                <Editor
                  height="100%"
                  language={getEditorLang(activeFile.name)}
                  value={fileContents[activeFile.id] ?? activeFile.content}
                  theme="vs-dark"
                  options={{
                    readOnly: activeFile.is_locked,
                    fontSize: 14,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    fontLigatures: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    renderLineHighlight: 'gutter',
                    tabSize: 4,
                    automaticLayout: true,
                    cursorBlinking: 'smooth',
                    padding: { top: 12 },
                    lineNumbers: 'on',
                  }}
                  onChange={(val) => {
                    if (!activeFile.is_locked) {
                      setFileContents(prev => ({ ...prev, [activeFile.id]: val || '' }))
                    }
                  }}
                  onMount={(editor) => { editorRef.current = editor }}
                />
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                <div style={{ textAlign: 'center' }}>
                  <FolderOpen size={40} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                  <p>Select a file from the VFS Explorer to start editing</p>
                </div>
              </div>
            )}
          </div>

          <div className="ide-resizer-v" onMouseDown={() => setIsResizingPreview(true)} />

          {/* Right panel: live preview (web) OR test results (console) */}
          <div className="ide-panel" style={{ width: previewWidth, flexShrink: 0 }}>
            {isWebProject ? (
              // ── Live Preview Panel ──────────────────────────────────────
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Preview header */}
                <div style={{
                  height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 0.875rem',
                  borderBottom: '1px solid var(--border)',
                  background: 'var(--bg-surface)',
                  flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                    <Globe size={14} />
                    LIVE PREVIEW
                    {execStatus === 'running' && (
                      <span style={{
                        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                        background: 'var(--accent-green)',
                        boxShadow: '0 0 6px var(--accent-green)',
                        animation: 'pulse 2s infinite',
                      }} />
                    )}
                  </div>
                  {execStatus === 'running' && (
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => {
                          const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement
                          if (iframe) iframe.src = iframe.src
                        }}
                        title="Refresh preview"
                      >
                        <RefreshCw size={12} />
                      </button>
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '0.2rem 0.5rem', display: 'flex', alignItems: 'center' }}
                        title="Open in new window"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>

                {/* Preview Viewport */}
                <div style={{ flex: 1, position: 'relative', background: '#fff' }}>
                  {execStatus === 'running' && previewUrl ? (
                    <iframe
                      id="preview-iframe"
                      src={previewUrl}
                      style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                  ) : (
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: '0.75rem', padding: '2rem', textAlign: 'center',
                      background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                    }}>
                      {execStatus === 'queued' || execStatus === 'building' || execStatus === 'starting' ? (
                        <>
                          <Loader className="spinner" size={24} />
                          <span style={{ fontSize: '0.8125rem' }}>
                            {execStatus === 'queued' ? 'Queued...' : execStatus === 'building' ? 'Building workspace...' : 'Starting application...'}
                          </span>
                        </>
                      ) : (
                        <>
                          <Globe size={32} style={{ opacity: 0.3 }} />
                          <span style={{ fontSize: '0.8125rem' }}>Application not running</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Click Run above to build and preview the app</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // ── Standard Console Execution Panel ───────────────────────
              <div className="terminal-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                  {bottomTabs.map(t => (
                    <button
                      key={t.key}
                      className={`panel-tab${panelTab === t.key ? ' active' : ''}`}
                      onClick={() => setPanelTab(t.key as any)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)' }}>
                  {panelTab === 'output' && (
                    <pre className="terminal-stdout" style={{ height: '100%', margin: 0, padding: '0.75rem' }}>
                      {terminalOutput.join('\n') || 'Run output will appear here...'}
                    </pre>
                  )}

                  {panelTab === 'testcases' && (
                    <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {testResults.map((tc, idx) => (
                        <div key={idx} style={{
                          padding: '0.6rem 0.75rem',
                          borderRadius: 6,
                          background: 'var(--bg-surface)',
                          border: `1px solid ${tc.passed ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)'}`,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Test Case {idx + 1}</span>
                            <span style={{
                              display: 'flex', alignItems: 'center', gap: '0.25rem',
                              fontSize: '0.7rem', fontWeight: 600,
                              color: tc.passed ? 'var(--accent-green)' : 'var(--accent-red)',
                            }}>
                              {tc.passed ? <CheckCircle size={12} /> : <XCircle size={12} />}
                              {tc.passed ? 'PASS' : 'FAIL'}
                            </span>
                          </div>
                          {tc.error ? (
                            <pre style={{ margin: 0, fontSize: '0.75rem', color: 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>{tc.error}</pre>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem' }}>
                              {tc.expected_output && <div><span style={{ color: 'var(--text-muted)' }}>Expected:</span> <code>{tc.expected_output}</code></div>}
                              {tc.actual_output && <div><span style={{ color: 'var(--text-muted)' }}>Got:</span> <code>{tc.actual_output}</code></div>}
                            </div>
                          )}
                        </div>
                      ))}
                      {testResults.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                          No public test results available. Run code to evaluate.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Shared bottom panel for logs when using Live Preview */}
        {isWebProject && (
          <>
            <div className="ide-resizer-h" onMouseDown={() => setIsResizingTerminal(true)} />
            <div style={{ height: terminalHeight, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', flexShrink: 0 }}>
                {bottomTabs.map(t => (
                  <button
                    key={t.key}
                    className={`panel-tab${panelTab === t.key ? ' active' : ''}`}
                    onClick={() => setPanelTab(t.key as any)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-base)' }}>
                {(panelTab === 'buildlog' || panelTab === 'runlog') && (
                  <pre className="terminal-stdout" style={{ height: '100%', margin: 0, padding: '0.75rem' }}>
                    {terminalOutput.join('\n') || 'Logs will appear here...'}
                  </pre>
                )}
                {panelTab === 'testcases' && (
                  <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {testResults.map((tc, idx) => (
                      <div key={idx} style={{
                        padding: '0.6rem 0.75rem',
                        borderRadius: 6,
                        background: 'var(--bg-surface)',
                        border: `1px solid ${tc.passed ? 'rgba(63,185,80,0.25)' : 'rgba(248,81,73,0.25)'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Test Case {idx + 1}</span>
                          <span style={{
                            display: 'flex', alignItems: 'center', gap: '0.25rem',
                            fontSize: '0.7rem', fontWeight: 600,
                            color: tc.passed ? 'var(--accent-green)' : 'var(--accent-red)',
                          }}>
                            {tc.passed ? <CheckCircle size={12} /> : <XCircle size={12} />}
                            {tc.passed ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem' }}>
                          {tc.expected_output && <div><span style={{ color: 'var(--text-muted)' }}>Expected:</span> <code>{tc.expected_output}</code></div>}
                          {tc.actual_output && <div><span style={{ color: 'var(--text-muted)' }}>Got:</span> <code>{tc.actual_output}</code></div>}
                        </div>
                      </div>
                    ))}
                    {testResults.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        No test results available. Submit code to run evaluation suite.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
