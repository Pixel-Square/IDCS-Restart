import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ChevronLeft, Plus, Trash2, Upload, X, Check, Eye, EyeOff, Lock, Save, FileCode, Layers, RefreshCw, FolderPlus } from 'lucide-react'
import { assessmentsApi, mcqApi, projectsApi, testCasesApi, templatesApi } from '../../api'
import Editor from '@monaco-editor/react'
import FileTree, { TreeNode } from '../../components/FileTree'

// ── Language metadata ────────────────────────────────────────────────────────
const LANGUAGES = [
  { value: 'python', label: 'Python', ext: '.py', execution: 'Python 3' },
  { value: 'java',   label: 'Java',   ext: '.java', execution: 'Java 21' },
  { value: 'c',      label: 'C',      ext: '.c',    execution: 'C (GCC)' },
  { value: 'cpp',    label: 'C++',    ext: '.cpp',  execution: 'C++ (G++)' },
]

function getLangMeta(lang: string) {
  return LANGUAGES.find(l => l.value === lang) || LANGUAGES[1]
}

function normaliseFilename(name: string, lang: string): string {
  const meta = getLangMeta(lang)
  const ext = meta.ext
  // Strip any known extension first
  const knownExts = ['.py', '.java', '.c', '.cpp']
  let base = name
  for (const e of knownExts) {
    if (base.toLowerCase().endsWith(e)) { base = base.slice(0, -e.length); break }
  }
  return base + ext
}

// ── Editor language map ───────────────────────────────────────────────────────
function getEditorLang(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    java: 'java', py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
    c: 'c', cpp: 'cpp', cs: 'csharp', html: 'html', css: 'css', json: 'json', xml: 'xml', properties: 'properties',
    yml: 'yaml', yaml: 'yaml', sh: 'shell', cmd: 'shell', bat: 'shell', md: 'markdown'
  }
  return map[ext || ''] || 'plaintext'
}

export default function InchargeAssessmentPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [assessment, setAssessment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'questions' | 'project' | 'testcases' | 'settings'>('questions')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const assessmentId = Number(id)

  // MCQ
  const [questions, setQuestions] = useState<any[]>([])
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [showAddQ, setShowAddQ] = useState(false)
  const [qForm, setQForm] = useState({ question_text: '', correct_answer: '', wrong_ans1: '', wrong_ans2: '', wrong_ans3: '', marks: 1 })
  const fileRef = useRef<HTMLInputElement>(null)

  // Coding project — unified form with all fields
  const [project, setProject] = useState<any>(null)
  const [projectForm, setProjectForm] = useState({
    workspace_type: 'SINGLE_FILE' as 'SINGLE_FILE' | 'PROJECT',
    single_file_name: 'solution',
    single_file_language: 'java',
    time_limit_seconds: 10,
    memory_limit_mb: 256,
    cpu_limit: 0.5,
    supported_languages: ['.java'],
    entry_point: '',
    build_command: '',
    run_command: '',
    project_type: 'CONSOLE',
    runtime: 'JAVA',
    runtime_version: '21',
    build_tool: 'MAVEN',
    start_command: '',
    app_port: 8080,
    preview_enabled: false,
    env_vars: {} as Record<string, string>,
    working_directory: '',
  })
  
  // Virtual filesystem tree
  const [vfsTree, setVfsTree] = useState<TreeNode[]>([])
  const [rawFilesMap, setRawFilesMap] = useState<Record<number, any>>({})
  
  // Templates state
  const [availableTemplates, setAvailableTemplates] = useState<Record<string, any>>({})
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [applyingTemplate, setApplyingTemplate] = useState(false)

  const [savingProject, setSavingProject] = useState(false)
  
  // Add Folder/File state modals
  const [showAddFolder, setShowAddFolder] = useState(false)
  const [showAddFile, setShowAddFile] = useState(false)
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [parentFolderId, setParentFolderId] = useState<number | null>(null)
  const [newItemName, setNewItemName] = useState('')
  const [renameTarget, setRenameTarget] = useState<{type: 'file' | 'folder', id: number, currentName: string} | null>(null)

  const [selectedFile, setSelectedFile] = useState<any>(null)
  const [selectedFolder, setSelectedFolder] = useState<any>(null)
  const [importingZip, setImportingZip] = useState(false)
  const [fileContent, setFileContent] = useState('')

  // Test cases
  const [testCases, setTestCases] = useState<any[]>([])
  const [showAddTC, setShowAddTC] = useState(false)
  const [tcForm, setTcForm] = useState({ input_data: '', expected_output: '', is_hidden: false, marks: 1, description: '' })
  const [savingTC, setSavingTC] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3500)
  }

  const loadTree = async () => {
    try {
      const treeRes = await projectsApi.getTree(assessmentId)
      setVfsTree(treeRes.data.children || [])
    } catch (e) {
      console.error('Failed to load project tree', e)
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const aRes = await assessmentsApi.get(assessmentId)
      setAssessment(aRes.data)

      if (aRes.data.assessment_type === 'MCQ') {
        const qRes = await mcqApi.list(assessmentId)
        setQuestions(qRes.data)
      } else {
        try {
          const pRes = await projectsApi.get(assessmentId)
          setProject(pRes.data)
          setProjectForm({
            workspace_type: pRes.data.workspace_type || 'SINGLE_FILE',
            single_file_name: pRes.data.single_file_name || 'solution',
            single_file_language: pRes.data.single_file_language || 'java',
            time_limit_seconds: pRes.data.time_limit_seconds ?? 10,
            memory_limit_mb: pRes.data.memory_limit_mb ?? 256,
            cpu_limit: pRes.data.cpu_limit ?? 0.5,
            supported_languages: pRes.data.supported_languages || [],
            entry_point: pRes.data.entry_point || '',
            build_command: pRes.data.build_command || '',
            run_command: pRes.data.run_command || '',
            project_type: pRes.data.project_type || 'CONSOLE',
            runtime: pRes.data.runtime || 'JAVA',
            runtime_version: pRes.data.runtime_version || '21',
            build_tool: pRes.data.build_tool || 'MAVEN',
            start_command: pRes.data.start_command || '',
            app_port: pRes.data.app_port ?? 8080,
            preview_enabled: pRes.data.preview_enabled || false,
            env_vars: pRes.data.env_vars || {},
            working_directory: pRes.data.working_directory || '',
          })
          
          await loadTree()
          
          const fRes = await projectsApi.listFiles(pRes.data.id)
          const fMap: Record<number, any> = {}
          fRes.data.forEach((f: any) => { fMap[f.id] = f })
          setRawFilesMap(fMap)
          
        } catch { /* no project yet */ }
        
        // Fetch templates
        try {
          const templatesRes = await templatesApi.list()
          setAvailableTemplates(templatesRes.data)
        } catch (e) {
          console.error('Failed to load templates list', e)
        }

        const tcRes = await testCasesApi.list(assessmentId)
        setTestCases(tcRes.data)
      }
    } catch { navigate('/incharge') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [assessmentId])

  // ── MCQ handlers ──────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!importFile) return
    setImporting(true)
    try {
      const res = await mcqApi.import(assessmentId, importFile)
      showToast(`Imported ${res.data.created} questions!`)
      setImportFile(null)
      if (fileRef.current) fileRef.current.value = ''
      const qRes = await mcqApi.list(assessmentId)
      setQuestions(qRes.data)
    } catch (e: any) {
      showToast('Import failed: ' + (e?.response?.data?.errors?.[0] || 'Unknown error'), 'error')
    } finally { setImporting(false) }
  }

  const handleAddQuestion = async () => {
    try {
      await mcqApi.create({ ...qForm, assessment: assessmentId })
      setShowAddQ(false)
      setQForm({ question_text: '', correct_answer: '', wrong_ans1: '', wrong_ans2: '', wrong_ans3: '', marks: 1 })
      const qRes = await mcqApi.list(assessmentId)
      setQuestions(qRes.data)
      showToast('Question added!')
    } catch { showToast('Error', 'error') }
  }

  const handleDeleteQ = async (qid: number) => {
    if (!confirm('Delete question?')) return
    await mcqApi.delete(qid)
    const qRes = await mcqApi.list(assessmentId)
    setQuestions(qRes.data)
  }

  // ── Project workspace configuration ───────────────────────────────────────
  const handleSaveProject = async () => {
    setSavingProject(true)
    try {
      if (project) {
        await projectsApi.update(assessmentId, projectForm)
      } else {
        await projectsApi.create(assessmentId, { ...projectForm, assessment: assessmentId })
      }
      await load()
      showToast('Workspace settings saved!')
    } catch { showToast('Error saving project', 'error') }
    finally { setSavingProject(false) }
  }

  // Template execution
  const handleApplyTemplate = async () => {
    if (!project) { showToast('Create project config first', 'error'); return }
    if (!selectedTemplateId) { showToast('Select a template first', 'error'); return }
    if (!confirm('Warning: Applying a template will delete all existing files in this project workspace. Proceed?')) return

    setApplyingTemplate(true)
    try {
      await templatesApi.apply(project.id, selectedTemplateId)
      showToast('Template applied successfully!')
      setSelectedFile(null)
      await load()
    } catch (e: any) {
      showToast('Error applying template: ' + (e?.response?.data?.detail || 'Unknown error'), 'error')
    } finally {
      setApplyingTemplate(false)
    }
  }

  // ── FileTree & Virtual Filesystem CRUD handlers ───────────────────────────
  const handleSelectFile = async (node: { id: number; name: string }) => {
    setSelectedFolder(null)
    try {
      let fileObj = rawFilesMap[node.id]
      if (!fileObj) {
        // Fallback or refetch
        const fRes = await projectsApi.listFiles(project.id)
        const matched = fRes.data.find((f: any) => f.id === node.id)
        if (matched) fileObj = matched
      }
      if (fileObj) {
        setSelectedFile(fileObj)
        setFileContent(fileObj.content)
      }
    } catch (e) {
      showToast('Error loading file', 'error')
    }
  }

  const handleSelectFolder = (node: any) => {
    setSelectedFile(null)
    setSelectedFolder(node)
  }

  const handleCreateFolder = async () => {
    if (!newItemName) return
    try {
      await projectsApi.createFolder({
        project: project.id,
        parent: parentFolderId,
        name: newItemName,
      })
      showToast('Folder created!')
      setShowAddFolder(false)
      setNewItemName('')
      await loadTree()
    } catch (e: any) {
      showToast('Error creating folder', 'error')
    }
  }

  const handleCreateFile = async () => {
    if (!newItemName) return
    try {
      await projectsApi.createFile({
        project: project.id,
        folder: parentFolderId,
        name: newItemName,
        content: '',
      })
      showToast('File created!')
      setShowAddFile(false)
      setNewItemName('')
      await loadTree()
      
      // Update files cache
      const fRes = await projectsApi.listFiles(project.id)
      const fMap: Record<number, any> = {}
      fRes.data.forEach((f: any) => { fMap[f.id] = f })
      setRawFilesMap(fMap)
    } catch (e: any) {
      showToast('Error creating file', 'error')
    }
  }
  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !project) return
    setImportingZip(true)
    try {
      await projectsApi.importZip(project.id, file)
      showToast('Zip imported successfully!')
      await loadTree()
      // Update files cache
      const fRes = await projectsApi.listFiles(project.id)
      const fMap: Record<number, any> = {}
      fRes.data.forEach((f: any) => { fMap[f.id] = f })
      setRawFilesMap(fMap)
    } catch (err: any) {
      showToast(err?.response?.data?.detail || 'Error importing zip', 'error')
    } finally {
      setImportingZip(false)
      // reset file input
      e.target.value = ''
    }
  }

  const handleRenameSubmit = async () => {
    if (!renameTarget || !newItemName) return
    try {
      if (renameTarget.type === 'folder') {
        await projectsApi.updateFolder(renameTarget.id, { name: newItemName })
      } else {
        await projectsApi.updateFile(renameTarget.id, { name: newItemName })
      }
      showToast('Renamed successfully!')
      setShowRenameModal(false)
      setNewItemName('')
      setRenameTarget(null)
      await loadTree()
      
      const fRes = await projectsApi.listFiles(project.id)
      const fMap: Record<number, any> = {}
      fRes.data.forEach((f: any) => { fMap[f.id] = f })
      setRawFilesMap(fMap)
    } catch (e: any) {
      showToast('Rename failed', 'error')
    }
  }

  const handleDeleteNode = async (type: 'file' | 'folder', id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete ${type} "${name}"?`)) return
    try {
      if (type === 'folder') {
        await projectsApi.deleteFolder(id)
      } else {
        await projectsApi.deleteFile(id)
        if (selectedFile?.id === id) {
          setSelectedFile(null)
        }
      }
      showToast('Deleted successfully!')
      await loadTree()
      
      const fRes = await projectsApi.listFiles(project.id)
      const fMap: Record<number, any> = {}
      fRes.data.forEach((f: any) => { fMap[f.id] = f })
      setRawFilesMap(fMap)
    } catch (e: any) {
      showToast('Failed to delete item', 'error')
    }
  }

  const handleSaveFileContent = async () => {
    if (!selectedFile) return
    try {
      await projectsApi.updateFile(selectedFile.id, { content: fileContent })
      // Update rawFilesMap cache
      setRawFilesMap(prev => ({
        ...prev,
        [selectedFile.id]: { ...prev[selectedFile.id], content: fileContent }
      }))
      showToast('File saved!')
    } catch { showToast('Error saving file', 'error') }
  }

  // ── Test case handlers ────────────────────────────────────────────────────
  const handleAddTC = async () => {
    setSavingTC(true)
    try {
      await testCasesApi.create({ ...tcForm, assessment: assessmentId })
      setShowAddTC(false)
      setTcForm({ input_data: '', expected_output: '', is_hidden: false, marks: 1, description: '' })
      const tcRes = await testCasesApi.list(assessmentId)
      setTestCases(tcRes.data)
      showToast('Test case added!')
    } catch { showToast('Error', 'error') }
    finally { setSavingTC(false) }
  }

  const handleDeleteTC = async (tcid: number) => {
    if (!confirm('Delete test case?')) return
    await testCasesApi.delete(tcid)
    const tcRes = await testCasesApi.list(assessmentId)
    setTestCases(tcRes.data)
  }

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <div className="spinner" style={{ width: 32, height: 32 }} />
    </div>
  )

  const isMCQ = assessment?.assessment_type === 'MCQ'
  const isSingleFile = projectForm.workspace_type === 'SINGLE_FILE'
  const generatedFilename = normaliseFilename(projectForm.single_file_name || 'solution', projectForm.single_file_language)
  const langMeta = getLangMeta(projectForm.single_file_language)

  const tabs = isMCQ
    ? [{ key: 'questions', label: 'Questions' }, { key: 'settings', label: 'Settings' }]
    : [{ key: 'project', label: 'Workspace Setup' }, { key: 'testcases', label: 'Test Cases' }, { key: 'settings', label: 'Settings' }]

  return (
    <div className="page" style={{ animation: 'fadeIn 0.4s ease' }}>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.type === 'success' ? <Check size={16} /> : <X size={16} />}{toast.msg}</div>}

      <div className="page-header">
        <Link to={`/incharge/sessions/${assessment?.session}`} className="btn btn-ghost btn-sm" style={{ marginBottom: '1rem' }}>
          <ChevronLeft size={15} /> Back to Session
        </Link>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="page-title">{assessment?.title}</h1>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.375rem' }}>
              <span className={`badge badge-${isMCQ ? 'blue' : 'brand'}`}>{isMCQ ? 'MCQ' : 'CODING'}</span>
              <span className="badge badge-gray">{assessment?.status}</span>
              {!isMCQ && <span className="badge badge-gray">{isSingleFile ? '📄 Single File' : '📁 Project'}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="tabs" style={{ marginBottom: '1.5rem' }}>
        {tabs.map(t => (
          <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key as any)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── MCQ: Questions tab ─────────────────────────────────────────── */}
      {isMCQ && tab === 'questions' && (
        <div>
          {/* Import */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={14} /> Choose Excel
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                  onChange={e => setImportFile(e.target.files?.[0] || null)} />
              </label>
              {importFile && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{importFile.name}</span>}
              <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={!importFile || importing}>
                {importing ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Upload size={14} />}
                Import from Excel
              </button>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddQ(true)}>
                <Plus size={14} /> Add Question
              </button>
            </div>
          </div>

          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
            {questions.length} question{questions.length !== 1 ? 's' : ''}
          </div>

          {questions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
              Import questions from Excel or add manually
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {questions.map((q: any, i: number) => (
                <div key={q.id} className="card" style={{ padding: '1rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', minWidth: 24 }}>Q{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.5rem' }}>{q.question_text}</p>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span className="badge badge-green" style={{ fontSize: '0.7rem' }}>✓ {q.correct_answer}</span>
                      {[q.wrong_ans1, q.wrong_ans2, q.wrong_ans3].filter(Boolean).map((w, wi) => (
                        <span key={wi} className="badge badge-gray" style={{ fontSize: '0.7rem' }}>✗ {w}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{q.marks}pt</span>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteQ(q.id)}><Trash2 size={12} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showAddQ && (
            <div className="modal-overlay" onClick={() => setShowAddQ(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <span className="modal-title">Add MCQ Question</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAddQ(false)}><X size={16} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  <div className="form-group">
                    <label className="label">Question *</label>
                    <textarea className="input" rows={3} value={qForm.question_text} onChange={e => setQForm(f => ({ ...f, question_text: e.target.value }))} placeholder="Enter question text..." />
                  </div>
                  <div className="form-group">
                    <label className="label">Correct Answer *</label>
                    <input className="input" value={qForm.correct_answer} onChange={e => setQForm(f => ({ ...f, correct_answer: e.target.value }))} />
                  </div>
                  {['wrong_ans1', 'wrong_ans2', 'wrong_ans3'].map((k, i) => (
                    <div key={k} className="form-group">
                      <label className="label">Wrong Answer {i + 1}</label>
                      <input className="input" value={(qForm as any)[k]} onChange={e => setQForm(f => ({ ...f, [k]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="form-group">
                    <label className="label">Marks</label>
                    <input className="input" type="number" min="1" value={qForm.marks} onChange={e => setQForm(f => ({ ...f, marks: Number(e.target.value) }))} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setShowAddQ(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleAddQuestion} disabled={!qForm.question_text || !qForm.correct_answer}>
                      <Check size={16} /> Add Question
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Coding: Workspace Setup tab ────────────────────────────────── */}
      {!isMCQ && tab === 'project' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* ── Workspace Type selector ─────────────────────────────────── */}
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: '1rem', fontSize: '0.95rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Assessment Workspace
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
              {/* Single File Option */}
              <label style={{
                display: 'flex', gap: '0.875rem', padding: '1rem 1.125rem',
                borderRadius: 'var(--radius-md)',
                border: `2px solid ${isSingleFile ? 'var(--brand)' : 'var(--border)'}`,
                background: isSingleFile ? 'rgba(99,102,241,0.08)' : 'var(--bg-elevated)',
                cursor: 'pointer', transition: 'all 0.2s',
              }}>
                <input type="radio" name="workspace_type" value="SINGLE_FILE"
                  checked={isSingleFile}
                  onChange={() => setProjectForm(f => ({ ...f, workspace_type: 'SINGLE_FILE' }))}
                  style={{ display: 'none' }} />
                <div style={{ marginTop: 2, flexShrink: 0 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: `2px solid ${isSingleFile ? 'var(--brand)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSingleFile && <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--brand)' }} />}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    <FileCode size={16} color={isSingleFile ? 'var(--brand-light)' : 'var(--text-muted)'} />
                    Single File
                  </div>
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    One code file. Best for algorithms, data structures, standard I/O problems.
                  </div>
                </div>
              </label>

              {/* Project Option */}
              <label style={{
                display: 'flex', gap: '0.875rem', padding: '1rem 1.125rem',
                borderRadius: 'var(--radius-md)',
                border: `2px solid ${!isSingleFile ? 'var(--brand)' : 'var(--border)'}`,
                background: !isSingleFile ? 'rgba(99,102,241,0.08)' : 'var(--bg-elevated)',
                cursor: 'pointer', transition: 'all 0.2s',
              }}>
                <input type="radio" name="workspace_type" value="PROJECT"
                  checked={!isSingleFile}
                  onChange={() => setProjectForm(f => ({ ...f, workspace_type: 'PROJECT' }))}
                  style={{ display: 'none' }} />
                <div style={{ marginTop: 2, flexShrink: 0 }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: `2px solid ${!isSingleFile ? 'var(--brand)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {!isSingleFile && <div style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--brand)' }} />}
                  </div>
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                    <Layers size={16} color={!isSingleFile ? 'var(--brand-light)' : 'var(--text-muted)'} />
                    Project / Application
                  </div>
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Multi-file project. For Spring Boot, web apps, React, full-stack.
                  </div>
                </div>
              </label>
            </div>

            {/* ── SINGLE FILE fields ──────────────────────────────────────── */}
            {isSingleFile && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="label">File Name <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(no extension)</span></label>
                    <input className="input" style={{ fontFamily: 'var(--font-mono)' }}
                      value={projectForm.single_file_name}
                      onChange={e => setProjectForm(f => ({ ...f, single_file_name: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') }))}
                      placeholder="solution" />
                  </div>
                  <div className="form-group">
                    <label className="label">Language</label>
                    <select className="input" value={projectForm.single_file_language}
                      onChange={e => setProjectForm(f => ({ ...f, single_file_language: e.target.value }))}>
                      {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Generated file preview */}
                <div style={{
                  padding: '0.875rem 1rem',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex', gap: '2rem', flexWrap: 'wrap',
                }}>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Generated File</div>
                    <code style={{ color: 'var(--accent-blue)', fontSize: '0.95rem', fontFamily: 'var(--font-mono)' }}>
                      📄 {generatedFilename}
                    </code>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Execution</div>
                    <span style={{ color: 'var(--accent-green)', fontSize: '0.875rem', fontWeight: 500 }}>{langMeta.execution}</span>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Commands</div>
                    <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      Auto-generated from language
                    </span>
                  </div>
                </div>

                <div className="grid-2">
                  <div className="form-group">
                    <label className="label">Time Limit (sec)</label>
                    <input className="input" type="number" min="1" max="60"
                      value={projectForm.time_limit_seconds}
                      onChange={e => setProjectForm(f => ({ ...f, time_limit_seconds: Number(e.target.value) }))} />
                  </div>
                  <div className="form-group">
                    <label className="label">Memory (MB)</label>
                    <input className="input" type="number" min="64" max="1024"
                      value={projectForm.memory_limit_mb}
                      onChange={e => setProjectForm(f => ({ ...f, memory_limit_mb: Number(e.target.value) }))} />
                  </div>
                </div>

                <button className="btn btn-primary" onClick={handleSaveProject} disabled={savingProject}>
                  {savingProject ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <Save size={16} />}
                  {project ? 'Update Workspace' : 'Create Workspace'}
                </button>
              </div>
            )}

            {/* ── PROJECT fields ────────────────────────────────────────── */}
            {!isSingleFile && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

                <div className="form-group">
                  <label className="label">Project Type</label>
                  <select className="input" value={projectForm.project_type}
                    onChange={e => setProjectForm(f => ({ ...f, project_type: e.target.value }))}>
                    <option value="CONSOLE">Console Project</option>
                    <option value="WEB">Web (Static HTML)</option>
                    <option value="SPRING_BOOT">Spring Boot</option>
                    <option value="FRONTEND">Frontend (React/Node)</option>
                    <option value="FULL_STACK">Full Stack</option>
                  </select>
                </div>

                {/* ── Templates Picker ── */}
                {project && availableTemplates[projectForm.project_type] && (
                  <div className="form-group" style={{ background: 'rgba(99,102,241,0.04)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)' }}>
                    <label className="label" style={{ fontWeight: 600 }}>Apply Framework / Boilerplate Template</label>
                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                      <select 
                        className="input" 
                        style={{ flex: 1 }}
                        value={selectedTemplateId} 
                        onChange={e => setSelectedTemplateId(e.target.value)}
                      >
                        <option value="">-- Choose template --</option>
                        {Object.entries(availableTemplates[projectForm.project_type]).flatMap(([framework, list]: any) => 
                          list.map((t: any) => (
                            <option key={t.id} value={t.id}>{framework} - {t.label}</option>
                          ))
                        )}
                      </select>
                      <button 
                        className="btn btn-brand btn-sm" 
                        disabled={applyingTemplate || !selectedTemplateId}
                        onClick={handleApplyTemplate}
                      >
                        {applyingTemplate ? <RefreshCw className="spinner" size={14} /> : 'Apply Template'}
                      </button>
                    </div>
                    {selectedTemplateId && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                        {Object.values(availableTemplates[projectForm.project_type]).flatMap((list: any) => list).find((t: any) => t.id === selectedTemplateId)?.description}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid-2">
                  <div className="form-group">
                    <label className="label">Runtime</label>
                    <select className="input" value={projectForm.runtime}
                      onChange={e => setProjectForm(f => ({ ...f, runtime: e.target.value }))}>
                      <option value="JAVA">Java</option>
                      <option value="PYTHON">Python</option>
                      <option value="NODE">Node.js</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">Version</label>
                    <input className="input" value={projectForm.runtime_version}
                      onChange={e => setProjectForm(f => ({ ...f, runtime_version: e.target.value }))}
                      placeholder="21" />
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Build Tool</label>
                  <select className="input" value={projectForm.build_tool}
                    onChange={e => setProjectForm(f => ({ ...f, build_tool: e.target.value }))}>
                    <option value="MAVEN">Maven</option>
                    <option value="GRADLE">Gradle</option>
                    <option value="NPM">npm</option>
                    <option value="NONE">None</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="label">Build Command</label>
                  <input className="input" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
                    value={projectForm.build_command}
                    onChange={e => setProjectForm(f => ({ ...f, build_command: e.target.value }))}
                    placeholder={projectForm.project_type === 'SPRING_BOOT' ? 'mvn clean package -DskipTests' : 'javac -d out src/Main.java'} />
                </div>

                {projectForm.project_type === 'CONSOLE' ? (
                  <div className="form-group">
                    <label className="label">Run Command *</label>
                    <input className="input" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
                      value={projectForm.run_command}
                      onChange={e => setProjectForm(f => ({ ...f, run_command: e.target.value }))}
                      placeholder="java -cp out Main" />
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="label">Start Command</label>
                    <input className="input" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
                      value={projectForm.start_command}
                      onChange={e => setProjectForm(f => ({ ...f, start_command: e.target.value }))}
                      placeholder="java -jar target/*.jar" />
                  </div>
                )}

                <div className="form-group">
                  <label className="label">Entry Point</label>
                  <input className="input" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
                    value={projectForm.entry_point}
                    onChange={e => setProjectForm(f => ({ ...f, entry_point: e.target.value }))}
                    placeholder="src/Main.java" />
                </div>

                {projectForm.project_type !== 'CONSOLE' && (
                  <>
                    <div className="form-group">
                      <label className="label">Application Port</label>
                      <input className="input" type="number" min="1024" max="65535"
                        value={projectForm.app_port}
                        onChange={e => setProjectForm(f => ({ ...f, app_port: Number(e.target.value) }))} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Port the app listens on inside the container</span>
                    </div>

                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={projectForm.preview_enabled}
                          onChange={e => setProjectForm(f => ({ ...f, preview_enabled: e.target.checked }))}
                          style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
                        <span className="label" style={{ margin: 0 }}>Enable Live Preview</span>
                      </label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 24 }}>
                        Students will see a live preview panel in the IDE
                      </span>
                    </div>
                  </>
                )}

                <div className="grid-2">
                  <div className="form-group">
                    <label className="label">Time Limit (sec)</label>
                    <input className="input" type="number" min="1" max="600"
                      value={projectForm.time_limit_seconds}
                      onChange={e => setProjectForm(f => ({ ...f, time_limit_seconds: Number(e.target.value) }))} />
                  </div>
                  <div className="form-group">
                    <label className="label">Memory (MB)</label>
                    <input className="input" type="number" min="64"
                      value={projectForm.memory_limit_mb}
                      onChange={e => setProjectForm(f => ({ ...f, memory_limit_mb: Number(e.target.value) }))} />
                  </div>
                </div>

                <button className="btn btn-primary" onClick={handleSaveProject} disabled={savingProject}>
                  {savingProject ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <Save size={16} />}
                  {project ? 'Update Config' : 'Create Project'}
                </button>
              </div>
            )}
          </div>

          {/* ── Virtual VFS Explorer + File Manager ── */}
          {project && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.875rem' }}>
                <h3 style={{ fontWeight: 600, margin: 0 }}>
                  {isSingleFile ? 'Starter Code File' : 'Project Files Workspace'}
                </h3>
                {!isSingleFile && (
                  <div>
                    <input
                      type="file"
                      accept=".zip"
                      id="zip-import-input"
                      style={{ display: 'none' }}
                      onChange={handleZipUpload}
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => document.getElementById('zip-import-input')?.click()}
                      disabled={importingZip}
                    >
                      {importingZip ? (
                        <div className="spinner" style={{ width: 12, height: 12 }} />
                      ) : (
                        <Upload size={14} />
                      )}
                      Import ZIP
                    </button>
                  </div>
                )}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: isSingleFile ? '1fr' : '260px 1fr', gap: '1.25rem', minHeight: '420px' }}>
                
                {/* Left Side: VFS File Tree Explorer */}
                {!isSingleFile && (
                  <div style={{ borderRight: '1px solid var(--border)', paddingRight: '0.75rem', display: 'flex', flexDirection: 'column' }}>
                    <FileTree 
                      tree={vfsTree}
                      selectedFileId={selectedFile?.id}
                      selectedFolderId={selectedFolder?.id}
                      onSelectFile={handleSelectFile}
                      onSelectFolder={handleSelectFolder}
                      onAddFile={(parent) => {
                        setParentFolderId(parent)
                        setNewItemName('')
                        setShowAddFile(true)
                      }}
                      onAddFolder={(parent) => {
                        setParentFolderId(parent)
                        setNewItemName('')
                        setShowAddFolder(true)
                      }}
                      onRename={(type, itemId, name) => {
                        setRenameTarget({type, id: itemId, currentName: name})
                        setNewItemName(name)
                        setShowRenameModal(true)
                      }}
                      onDelete={handleDeleteNode}
                    />
                  </div>
                )}

                {/* Right Side: Monaco Code Editor */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  {selectedFile ? (
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                          📄 {selectedFile.name} {selectedFile.is_locked ? '(LOCKED)' : ''}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {!isSingleFile && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                              <input type="checkbox" checked={selectedFile.is_locked}
                                onChange={async e => {
                                  await projectsApi.updateFile(selectedFile.id, { is_locked: e.target.checked })
                                  const matched = { ...selectedFile, is_locked: e.target.checked }
                                  setSelectedFile(matched)
                                  setRawFilesMap(prev => ({ ...prev, [selectedFile.id]: matched }))
                                }}
                                style={{ accentColor: 'var(--accent-yellow)' }} />
                              <Lock size={12} /> Locked
                            </label>
                          )}
                          <button className="btn btn-primary btn-sm" onClick={handleSaveFileContent}>
                            <Save size={14} /> Save Code
                          </button>
                        </div>
                      </div>
                      <div style={{ flex: 1, height: '400px', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <Editor
                          height="100%"
                          language={getEditorLang(selectedFile.name)}
                          value={fileContent}
                          theme="vs-dark"
                          onChange={v => setFileContent(v || '')}
                          options={{
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            automaticLayout: true,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)', fontSize: '0.875rem', padding: '2rem' }}>
                      {isSingleFile ? 'Saving configuration will load the single file starter code.' : 'Select a file from the Workspace Tree to start editing code.'}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* New Folder Modal */}
          {showAddFolder && (
            <div className="modal-overlay" onClick={() => setShowAddFolder(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <span className="modal-title">Create Folder</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAddFolder(false)}><X size={16} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="label">Folder Name</label>
                    <input className="input" value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="e.g. controllers" />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setShowAddFolder(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleCreateFolder} disabled={!newItemName}>Create</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* New File Modal */}
          {showAddFile && (
            <div className="modal-overlay" onClick={() => setShowAddFile(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <span className="modal-title">Create File</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAddFile(false)}><X size={16} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="label">File Name</label>
                    <input className="input" value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="e.g. UserController.java" />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setShowAddFile(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleCreateFile} disabled={!newItemName}>Create</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Rename Modal */}
          {showRenameModal && renameTarget && (
            <div className="modal-overlay" onClick={() => setShowRenameModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <span className="modal-title">Rename {renameTarget.type === 'folder' ? 'Folder' : 'File'}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowRenameModal(false)}><X size={16} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="label">New Name</label>
                    <input className="input" value={newItemName} onChange={e => setNewItemName(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setShowRenameModal(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleRenameSubmit} disabled={!newItemName || newItemName === renameTarget.currentName}>Rename</button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ── Test Cases tab ─────────────────────────────────────────────── */}
      {!isMCQ && tab === 'testcases' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              {testCases.length} test case{testCases.length !== 1 ? 's' : ''}
            </span>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddTC(true)}>
              <Plus size={14} /> Add Test Case
            </button>
          </div>

          {testCases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', color: 'var(--text-muted)' }}>
              No test cases yet. Add some to evaluate student code.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {testCases.map((tc: any, i: number) => (
                <div key={tc.id} className="card" style={{ padding: '0.875rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>TC {i + 1}</span>
                      {tc.is_hidden
                        ? <span className="badge badge-yellow" style={{ fontSize: '0.7rem' }}><EyeOff size={10} /> Hidden</span>
                        : <span className="badge badge-green" style={{ fontSize: '0.7rem' }}><Eye size={10} /> Public</span>}
                      <span className="badge badge-gray" style={{ fontSize: '0.7rem' }}>{tc.marks} pts</span>
                    </div>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTC(tc.id)}><Trash2 size={12} /></button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8rem' }}>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem', fontSize: '0.7rem', textTransform: 'uppercase' }}>Input</div>
                      <pre style={{ background: 'var(--bg-base)', padding: '0.5rem', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', margin: 0, overflowX: 'auto' }}>
                        {tc.input_data || '(empty)'}
                      </pre>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)', marginBottom: '0.2rem', fontSize: '0.7rem', textTransform: 'uppercase' }}>Expected Output</div>
                      <pre style={{ background: 'var(--bg-base)', padding: '0.5rem', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: '0.78rem', margin: 0, overflowX: 'auto' }}>
                        {tc.expected_output || '(empty)'}
                      </pre>
                    </div>
                  </div>
                  {tc.description && <div style={{ marginTop: '0.375rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tc.description}</div>}
                </div>
              ))}
            </div>
          )}

          {showAddTC && (
            <div className="modal-overlay" onClick={() => setShowAddTC(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <span className="modal-title">Add Test Case</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAddTC(false)}><X size={16} /></button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                  <div className="form-group">
                    <label className="label">Input (stdin)</label>
                    <textarea className="input" rows={3} value={tcForm.input_data}
                      onChange={e => setTcForm(f => ({ ...f, input_data: e.target.value }))}
                      placeholder="5 10" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} />
                  </div>
                  <div className="form-group">
                    <label className="label">Expected Output *</label>
                    <textarea className="input" rows={3} value={tcForm.expected_output}
                      onChange={e => setTcForm(f => ({ ...f, expected_output: e.target.value }))}
                      placeholder="15" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} />
                  </div>
                  <div className="form-group">
                    <label className="label">Description (optional)</label>
                    <input className="input" value={tcForm.description}
                      onChange={e => setTcForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="Basic addition" />
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label className="label">Marks</label>
                      <input className="input" type="number" min="1" value={tcForm.marks}
                        onChange={e => setTcForm(f => ({ ...f, marks: Number(e.target.value) }))} />
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1.75rem' }}>
                        <input type="checkbox" checked={tcForm.is_hidden}
                          onChange={e => setTcForm(f => ({ ...f, is_hidden: e.target.checked }))}
                          style={{ width: 16, height: 16, accentColor: 'var(--brand)' }} />
                        <span className="label" style={{ margin: 0 }}>Hidden (not shown to students)</span>
                      </label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setShowAddTC(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleAddTC} disabled={savingTC || !tcForm.expected_output}>
                      {savingTC ? <div className="spinner" style={{ width: 14, height: 14 }} /> : <Check size={16} />}
                      Add Test Case
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Settings tab ──────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="card">
          <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}>Assessment Settings</h3>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            <p><strong>Title:</strong> {assessment?.title}</p>
            <p style={{ marginTop: '0.5rem' }}><strong>Type:</strong> {assessment?.assessment_type}</p>
            <p style={{ marginTop: '0.5rem' }}><strong>Status:</strong> {assessment?.status}</p>
            <p style={{ marginTop: '0.5rem' }}><strong>Max Attempts:</strong> {assessment?.max_attempts}</p>
            <p style={{ marginTop: '0.5rem' }}><strong>Total Marks:</strong> {assessment?.total_marks}</p>
          </div>
        </div>
      )}
    </div>
  )
}
