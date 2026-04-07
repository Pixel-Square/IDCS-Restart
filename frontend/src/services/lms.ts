import fetchWithAuth from './fetchAuth'
import { getApiBase } from './apiBase'

const API_BASE = getApiBase()
const LMS_BASE = `${API_BASE}/api/lms`

export type MaterialRow = {
  id: number
  title: string
  description?: string
  material_type: 'FILE' | 'LINK'
  file_size_bytes?: number
  file?: string | null
  original_file_name?: string | null
  external_url?: string | null
  uploaded_by_name?: string
  uploaded_by_staff_id?: string
  course: number
  course_name?: string
  department_code?: string
  teaching_assignment?: number | null
  created_at: string
  updated_at: string
  download_count?: number
}

export type CourseWiseMaterials = {
  course_id: number
  course_name: string
  department_code?: string
  materials: MaterialRow[]
}

export type UploadOption = {
  teaching_assignment_id: number
  course_id: number
  course_name: string
  subject_code?: string | null
  subject_name?: string | null
}

export type DownloadAuditRow = {
  id: number
  material: number
  material_title: string
  material_course_name: string
  downloaded_by: number | null
  user_name: string
  user_profile_type: string
  client_ip?: string | null
  downloaded_at: string
}

export type StaffQuotaRow = {
  id: number
  staff: number
  staff_id: string
  staff_name: string
  quota_bytes: number
  used_bytes: number
  updated_at: string
}

export type MyQuota = {
  staff_id: string
  quota_bytes: number
  used_bytes: number
  remaining_bytes: number
}

export type MaterialPreviewFile = {
  blob: Blob
  contentType: string
  filename: string
}

async function parseResults<T>(res: Response): Promise<T[]> {
  if (!res.ok) throw new Error(`Request failed: ${res.status}`)
  const data = await res.json()
  if (Array.isArray(data)) return data as T[]
  if (Array.isArray((data as any)?.results)) return (data as any).results as T[]
  return []
}

export async function getStaffMaterials(): Promise<CourseWiseMaterials[]> {
  const res = await fetchWithAuth(`${LMS_BASE}/materials/my/`)
  return parseResults<CourseWiseMaterials>(res)
}

export async function getStudentMaterials(): Promise<CourseWiseMaterials[]> {
  const res = await fetchWithAuth(`${LMS_BASE}/materials/student/course-wise/`)
  return parseResults<CourseWiseMaterials>(res)
}

export async function getHodMaterials(): Promise<CourseWiseMaterials[]> {
  const res = await fetchWithAuth(`${LMS_BASE}/materials/hod/course-wise/`)
  return parseResults<CourseWiseMaterials>(res)
}

export async function getIqacMaterials(): Promise<CourseWiseMaterials[]> {
  const res = await fetchWithAuth(`${LMS_BASE}/materials/iqac/course-wise/`)
  return parseResults<CourseWiseMaterials>(res)
}

export async function getUploadOptions(): Promise<UploadOption[]> {
  const res = await fetchWithAuth(`${LMS_BASE}/materials/my/upload-options/`)
  return parseResults<UploadOption>(res)
}

export async function createMaterial(form: FormData): Promise<MaterialRow> {
  const res = await fetchWithAuth(`${LMS_BASE}/materials/my/`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Failed to upload material')
  }
  return res.json()
}

export async function updateMaterial(id: number, payload: { title?: string; description?: string }): Promise<MaterialRow> {
  const res = await fetchWithAuth(`${LMS_BASE}/materials/my/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Failed to update material')
  }
  return res.json()
}

export async function deleteMaterial(id: number): Promise<void> {
  const res = await fetchWithAuth(`${LMS_BASE}/materials/my/${id}/`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) {
    const text = await res.text()
    throw new Error(text || 'Failed to delete material')
  }
}

export async function downloadMaterial(material: MaterialRow): Promise<void> {
  const res = await fetchWithAuth(`${LMS_BASE}/materials/${material.id}/download/`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Failed to download material')
  }

  if (material.material_type === 'LINK') {
    const data = await res.json()
    const url = String(data?.url || '')
    if (!url) throw new Error('Invalid link URL')
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }

  const disposition = res.headers.get('content-disposition') || ''
  const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i)
  const serverFilename = decodeURIComponent((filenameMatch?.[1] || filenameMatch?.[2] || '').trim())
  const fallbackFilename = material.original_file_name || (material.file ? String(material.file).split('/').pop() || material.title || 'study-material' : material.title || 'study-material')

  const blob = await res.blob()
  const objectUrl = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = serverFilename || fallbackFilename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(objectUrl)
}

export async function viewMaterial(material: MaterialRow): Promise<void> {
  if (material.material_type === 'LINK') {
    const res = await fetchWithAuth(`${LMS_BASE}/materials/${material.id}/download/`)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || 'Failed to view link')
    }
    const data = await res.json()
    const url = String(data?.url || '')
    if (!url) throw new Error('Invalid link URL')
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }

  const res = await fetchWithAuth(`${LMS_BASE}/materials/${material.id}/download/?inline=1`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Failed to view file')
  }
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  const arrayBuffer = await res.arrayBuffer()
  const blob = new Blob([arrayBuffer], { type: contentType })
  const objectUrl = window.URL.createObjectURL(blob)
  window.open(objectUrl, '_blank', 'noopener,noreferrer')
  // Revoke later to avoid closing before browser reads the blob
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 60_000)
}

export async function getMaterialPreviewFile(materialId: number): Promise<MaterialPreviewFile> {
  const res = await fetchWithAuth(`${LMS_BASE}/materials/${materialId}/download/?inline=1`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Failed to load preview file')
  }
  const disposition = res.headers.get('content-disposition') || ''
  const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i)
  const filename = decodeURIComponent((filenameMatch?.[1] || filenameMatch?.[2] || '').trim()) || 'study-material'
  const contentType = res.headers.get('content-type') || 'application/octet-stream'
  const blob = await res.blob()
  return { blob, contentType, filename }
}

export async function getDownloadAuditLogs(materialId?: number): Promise<DownloadAuditRow[]> {
  const qp = materialId ? `?material_id=${materialId}` : ''
  const res = await fetchWithAuth(`${LMS_BASE}/audit/downloads/${qp}`)
  return parseResults<DownloadAuditRow>(res)
}

export async function getStaffQuotas(): Promise<StaffQuotaRow[]> {
  const res = await fetchWithAuth(`${LMS_BASE}/quota/staff/`)
  return parseResults<StaffQuotaRow>(res)
}

export async function updateStaffQuota(staffId: number, quotaBytes: number): Promise<StaffQuotaRow> {
  const res = await fetchWithAuth(`${LMS_BASE}/quota/staff/`, {
    method: 'PATCH',
    body: JSON.stringify({ staff_id: staffId, quota_bytes: quotaBytes }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Failed to update quota')
  }
  return res.json()
}

export async function getMyQuota(): Promise<MyQuota> {
  const res = await fetchWithAuth(`${LMS_BASE}/quota/me/`)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Failed to fetch quota')
  }
  return res.json()
}
