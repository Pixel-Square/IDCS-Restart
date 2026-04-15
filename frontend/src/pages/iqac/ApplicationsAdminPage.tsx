import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  activateApplicationVersionAdmin,
  AppAdminOverview,
  AppFieldRow,
  AppTypeRow,
  AppVersionRow,
  createApplicationFieldAdmin,
  createApplicationFlowAdmin,
  createApplicationStepAdmin,
  createApplicationTypeAdmin,
  createApplicationVersionAdmin,
  deleteApplicationFieldAdmin,
  deleteApplicationStepAdmin,
  DepartmentRow,
  AdminUserSearchRow,
  fetchApplicationsAdminOverview,
  fetchApplicationFieldsAdmin,
  fetchApplicationFlowsAdmin,
  fetchApplicationNotificationSettings,
  fetchApplicationRoleHierarchyStagesAdmin,
  fetchApplicationRolePermissionsAdmin,
  fetchApplicationStepsAdmin,
  fetchApplicationSubmissionsAdmin,
  fetchApplicationTypesAdmin,
  fetchApplicationVersionsAdmin,
  fetchApplicationsAdminRoles,
  fetchDepartmentsAdmin,
  FlowRow,
  FlowStepRow,
  NotificationSettingsRow,
  searchApplicationsAdminUsers,
  reorderApplicationFieldsAdmin,
  RoleHierarchyStageRow,
  RolePermissionRow,
  RoleRow,
  saveApplicationRoleHierarchyStagesAdmin,
  saveApplicationRolePermissionsAdmin,
  SubmissionRow,
  updateApplicationFieldAdmin,
  updateApplicationFlowAdmin,
  updateApplicationNotificationSettings,
  updateApplicationStepAdmin,
  updateApplicationTypeAdmin,
} from '../../services/applicationsAdmin'

type TabKey = 'overview' | 'types' | 'fields' | 'versions' | 'starter-final' | 'flows' | 'hierarchy' | 'permissions' | 'submissions' | 'notifications'

type FieldDraft = {
  id: number | null
  field_key: string
  label: string
  field_type: string
  is_required: boolean
  order: number
  metaText: string
}

type TypeDraft = {
  id: number | null
  name: string
  code: string
  description: string
  is_active: boolean
}

type NewFlowDraft = {
  department_id: string
  is_active: boolean
  override_role_ids: number[]
}

type StepDraft = {
  id?: number
  order: number
  role_id: number
  stage_id: number | null
  sla_hours: string
  escalate_to_role_id: number | null
  next_step_type: 'OVERRIDE' | 'FINAL'
  is_final: boolean
  can_override: boolean
  auto_skip_if_unavailable: boolean
}

function findRoleIdByName(roles: RoleRow[], name: string): number | null {
  const lower = String(name || '').trim().toLowerCase()
  if (!lower) return null
  const exact = roles.find((r) => String(r.name || '').trim().toLowerCase() === lower)
  if (exact) return exact.id
  const contains = roles.find((r) => String(r.name || '').trim().toLowerCase().includes(lower))
  return contains ? contains.id : null
}

function emptyTypeDraft(): TypeDraft {
  return { id: null, name: '', code: '', description: '', is_active: true }
}

function getDefaultMetaForFieldType(fieldType: string): string {
  const typeMetadata: Record<string, any> = {
    'TEXT': { placeholder: '' },
    'DATE': { placeholder: 'Select date' },
    'TIME': { placeholder: 'Select time' },
    'DATE IN OUT': {
      subfields: {
        date: { type: 'date', label: 'Date' },
        in_time: { type: 'time', label: 'In Time' },
        out_time: { type: 'time', label: 'Out Time' }
      }
    },
    'DATE OUT IN': {
      // NOTE: OUT time implies start of window. Order: Date, Out, In.
      subfields: {
        date: { type: 'date', label: 'Date' },
        out_time: { type: 'time', label: 'Out Time' },
        in_time: { type: 'time', label: 'In Time' }
      }
    },
    'BOOLEAN': { placeholder: '' },
    'FILE': { placeholder: '' },
    'NUMBER': { placeholder: '' },
    'SELECT': { options: [] }
  }
  return JSON.stringify(typeMetadata[fieldType] || {}, null, 2)
}

function emptyFieldDraft(nextOrder = 1): FieldDraft {
  return {
    id: null,
    field_key: '',
    label: '',
    field_type: 'TEXT',
    is_required: false,
    order: nextOrder,
    metaText: getDefaultMetaForFieldType('TEXT'),
  }
}

function parseMeta(metaText: string): Record<string, any> {
  const trimmed = String(metaText || '').trim()
  if (!trimmed) return {}
  return JSON.parse(trimmed)
}

function jsonPretty(value: any): string {
  try {
    return JSON.stringify(value ?? {}, null, 2)
  } catch (_) {
    return '{}'
  }
}

function toStepDraft(step?: FlowStepRow | null, nextStep?: FlowStepRow | null): StepDraft {
  return {
    id: step?.id,
    order: step?.order || 1,
    role_id: step?.role_id || 0,
    stage_id: step?.stage_id ?? null,
    sla_hours: step?.sla_hours == null ? '' : String(step.sla_hours),
    escalate_to_role_id: step?.escalate_to_role_id ?? null,
    next_step_type: nextStep?.is_final ? 'FINAL' : 'OVERRIDE',
    is_final: Boolean((step as any)?.is_final),
    can_override: Boolean(step?.can_override),
    auto_skip_if_unavailable: Boolean(step?.auto_skip_if_unavailable),
  }
}

function buildStepDraftsFromFlows(flowsRes: FlowRow[]): Record<number, StepDraft> {
  const entries: Array<[number, StepDraft]> = []
  for (const flow of flowsRes || []) {
    const ordered = [...(flow.steps || [])].sort((a, b) => (a.order || 0) - (b.order || 0))
    for (let i = 0; i < ordered.length; i++) {
      const step = ordered[i]
      const next = ordered[i + 1] || null
      entries.push([step.id, toStepDraft(step, next)])
    }
  }
  return Object.fromEntries(entries)
}

function statusPillClass(active: boolean): string {
  return active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
}

function normalizeStageOrders<T extends { order: number }>(stages: T[]): T[] {
  return stages.map((s, idx) => ({ ...s, order: idx + 1 }))
}

function SectionCard(props: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{props.title}</h3>
          {props.subtitle ? <div className="text-xs text-gray-500 mt-1">{props.subtitle}</div> : null}
        </div>
        {props.right}
      </div>
      <div className="p-5">{props.children}</div>
    </div>
  )
}

export default function ApplicationsAdminPage(): JSX.Element {
  const location = useLocation()
  const navigate = useNavigate()

  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const initialTab = ((params.get('tab') as TabKey) || 'overview') as TabKey
  const [tab, setTab] = useState<TabKey>(initialTab)

  const [overview, setOverview] = useState<AppAdminOverview | null>(null)
  const [types, setTypes] = useState<AppTypeRow[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [fields, setFields] = useState<AppFieldRow[]>([])
  const [versions, setVersions] = useState<AppVersionRow[]>([])
  const [flows, setFlows] = useState<FlowRow[]>([])
  const [roleHierarchyStages, setRoleHierarchyStages] = useState<RoleHierarchyStageRow[]>([])
  const [rolePermissions, setRolePermissions] = useState<RolePermissionRow[]>([])
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([])
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettingsRow | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<{ key: string; label: string; value: string } | null>(null)
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)
  const [loadingBase, setLoadingBase] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [busy, setBusy] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [typeDraft, setTypeDraft] = useState<TypeDraft>(emptyTypeDraft())
  const [fieldDraft, setFieldDraft] = useState<FieldDraft>(emptyFieldDraft())
  const [newFlowDraft, setNewFlowDraft] = useState<NewFlowDraft>({ department_id: '', is_active: true, override_role_ids: [] })
  const [flowDrafts, setFlowDrafts] = useState<Record<number, { is_active: boolean; override_role_ids: number[]; sla_hours: string }>>({})
  const [stepDrafts, setStepDrafts] = useState<Record<number, StepDraft>>({})
  const [newStepDrafts, setNewStepDrafts] = useState<Record<number, StepDraft>>({})
  const [permissionDrafts, setPermissionDrafts] = useState<Record<number, { can_edit_all: boolean; can_override_flow: boolean }>>({})
  const [editingFlowId, setEditingFlowId] = useState<number | null>(null)

  const [stageDrafts, setStageDrafts] = useState<
    Array<{
      id?: number
      name: string
      order: number
      roles: Array<{ role_id: number; rankText: string }>
      users: Array<{ user_id?: number; username?: string; label?: string }>
    }>
  >([])
  const [selectedStageIndex, setSelectedStageIndex] = useState<number>(0)
  const [newStageName, setNewStageName] = useState<string>('')
  const [newStageUsername, setNewStageUsername] = useState<string>('')
  const [pinnedUserResults, setPinnedUserResults] = useState<AdminUserSearchRow[]>([])

  const [showGroupModal, setShowGroupModal] = useState(false)
  const [groupDraft, setGroupDraft] = useState<{ name: string; role_ids: number[] }>({ name: '', role_ids: [] })
  const [groups, setGroups] = useState<Array<{ id: string; name: string; role_ids: number[] }>>([])


  useEffect(() => {
    const p = (new URLSearchParams(location.search).get('tab') as TabKey | null) || 'overview'
    if (p !== tab) setTab(p)
  }, [location.search, tab])

  useEffect(() => {
    let mounted = true
    ;(async () => {
      setLoadingBase(true)
      setError(null)
      try {
        const [overviewRes, rolesRes, typesRes, departmentsRes] = await Promise.all([
          fetchApplicationsAdminOverview(),
          fetchApplicationsAdminRoles(),
          fetchApplicationTypesAdmin(),
          fetchDepartmentsAdmin().catch(() => []),
        ])
        if (!mounted) return
        setOverview(overviewRes)
        setRoles(rolesRes)
        setTypes(typesRes)
        setDepartments(departmentsRes)
        setSelectedTypeId((current) => current ?? typesRes[0]?.id ?? null)
      } catch (e: any) {
        if (!mounted) return
        setError(e?.message || 'Failed to load applications admin data.')
      } finally {
        if (mounted) setLoadingBase(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    if (tab !== 'hierarchy') return
    const q = String(newStageUsername || '').trim()
    if (q.length < 2) {
      setPinnedUserResults([])
      return
    }

    let alive = true
    setPinnedUserResults([])
    const t = window.setTimeout(async () => {
      try {
        const rows = await searchApplicationsAdminUsers(q)
        if (!alive) return
        setPinnedUserResults(Array.isArray(rows) ? rows : [])
      } catch (_e) {
        if (!alive) return
        setPinnedUserResults([])
      }
    }, 250)

    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [newStageUsername, tab])

  useEffect(() => {
    if (!selectedTypeId) return
    let mounted = true
    ;(async () => {
      setLoadingDetail(true)
      try {
        const [fieldsRes, versionsRes, flowsRes, stagesRes, permissionsRes, submissionsRes, notifSettingsRes] = await Promise.all([
          fetchApplicationFieldsAdmin(selectedTypeId),
          fetchApplicationVersionsAdmin(selectedTypeId),
          fetchApplicationFlowsAdmin(selectedTypeId),
          fetchApplicationRoleHierarchyStagesAdmin(selectedTypeId),
          fetchApplicationRolePermissionsAdmin(selectedTypeId),
          fetchApplicationSubmissionsAdmin(selectedTypeId),
          fetchApplicationNotificationSettings(selectedTypeId).catch(() => null),
        ])
        if (!mounted) return
        setFields(fieldsRes)
        setVersions(versionsRes)
        setFlows(flowsRes)
        setRoleHierarchyStages(stagesRes)
        setRolePermissions(permissionsRes)
        setSubmissions(submissionsRes)
        setNotificationSettings(notifSettingsRes)
        setFieldDraft(emptyFieldDraft((fieldsRes[fieldsRes.length - 1]?.order || 0) + 1))
        setFlowDrafts(Object.fromEntries(flowsRes.map((flow) => [flow.id, { is_active: flow.is_active, override_role_ids: flow.override_roles.map((r) => r.id), sla_hours: flow.sla_hours == null ? '' : String(flow.sla_hours) }])))
        setStepDrafts(buildStepDraftsFromFlows(flowsRes))
        const studentRoleId = findRoleIdByName(roles, 'student')
        setNewStepDrafts(Object.fromEntries(flowsRes.map((flow) => {
          const last: any = flow.steps[flow.steps.length - 1]
          const nextOrder = (last?.order || 0) + 1
          const roleIdForNew = flow.steps.length ? 0 : (studentRoleId || 0)
          return [
            flow.id,
            {
              order: nextOrder,
              role_id: roleIdForNew,
              stage_id: null,
              sla_hours: '',
              escalate_to_role_id: null,
              next_step_type: 'OVERRIDE',
              is_final: false,
              can_override: false,
              auto_skip_if_unavailable: false,
            },
          ]
        })))

        const byRoleId = new Map(permissionsRes.map((row) => [row.role_id, row]))
        const nextPermissionDrafts: Record<number, { can_edit_all: boolean; can_override_flow: boolean }> = {}
        roles.forEach((role) => {
          const row = byRoleId.get(role.id)
          nextPermissionDrafts[role.id] = {
            can_edit_all: Boolean(row?.can_edit_all),
            can_override_flow: Boolean(row?.can_override_flow),
          }
        })
        setPermissionDrafts(nextPermissionDrafts)

        const nextStageDrafts = (stagesRes || []).map((stage) => ({
          id: stage.id,
          name: stage.name,
          order: stage.order,
          roles: (stage.roles || []).map((r) => ({ role_id: r.role_id, rankText: String(r.rank) })),
          users: (stage.users || [])
            .map((u) => ({
              user_id: u.user_id,
              username: String(u.username || '').trim() || undefined,
              label: String(u.name || '').trim() || (String(u.username || '').trim() || undefined),
            }))
            .filter((u) => Boolean(u.user_id || u.username)),
        }))
        setStageDrafts(normalizeStageOrders(nextStageDrafts.slice().sort((a, b) => (a.order || 0) - (b.order || 0))))
        setSelectedStageIndex(0)
      } catch (e: any) {
        if (!mounted) return
        setError(e?.message || 'Failed to load selected application type.')
      } finally {
        if (mounted) setLoadingDetail(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [selectedTypeId, roles])

  useEffect(() => {
    if (editingFlowId == null) return
    const exists = flows.some((f) => f.id === editingFlowId)
    if (!exists) setEditingFlowId(null)
  }, [flows, editingFlowId])

  const selectedType = useMemo(() => types.find((row) => row.id === selectedTypeId) || null, [types, selectedTypeId])

  async function refreshBase(preserveSelection = true) {
    const [overviewRes, typesRes] = await Promise.all([
      fetchApplicationsAdminOverview(),
      fetchApplicationTypesAdmin(),
    ])
    setOverview(overviewRes)
    setTypes(typesRes)
    if (!preserveSelection || !typesRes.some((row) => row.id === selectedTypeId)) {
      setSelectedTypeId(typesRes[0]?.id ?? null)
    }
  }

  async function refreshSelectedTypeDetail(typeId = selectedTypeId) {
    if (!typeId) return
    const [fieldsRes, versionsRes, flowsRes, stagesRes, permissionsRes, submissionsRes] = await Promise.all([
      fetchApplicationFieldsAdmin(typeId),
      fetchApplicationVersionsAdmin(typeId),
      fetchApplicationFlowsAdmin(typeId),
      fetchApplicationRoleHierarchyStagesAdmin(typeId),
      fetchApplicationRolePermissionsAdmin(typeId),
      fetchApplicationSubmissionsAdmin(typeId),
    ])
    setFields(fieldsRes)
    setVersions(versionsRes)
    setFlows(flowsRes)
    setRoleHierarchyStages(stagesRes)
    setRolePermissions(permissionsRes)
    setSubmissions(submissionsRes)
    setFlowDrafts(Object.fromEntries(flowsRes.map((flow) => [flow.id, { is_active: flow.is_active, override_role_ids: flow.override_roles.map((r) => r.id), sla_hours: flow.sla_hours == null ? '' : String(flow.sla_hours) }])))
    setStepDrafts(buildStepDraftsFromFlows(flowsRes))
    const studentRoleId = findRoleIdByName(roles, 'student')
    setNewStepDrafts(Object.fromEntries(flowsRes.map((flow) => {
      const last: any = flow.steps[flow.steps.length - 1]
      const nextOrder = (last?.order || 0) + 1
      const roleIdForNew = flow.steps.length ? 0 : (studentRoleId || 0)
      return [
        flow.id,
        {
          order: nextOrder,
          role_id: roleIdForNew,
          stage_id: null,
          sla_hours: '',
          escalate_to_role_id: null,
          next_step_type: 'OVERRIDE',
          is_final: false,
          can_override: false,
          auto_skip_if_unavailable: false,
        },
      ]
    })))
    const byRoleId = new Map(permissionsRes.map((row) => [row.role_id, row]))
    const nextPermissionDrafts: Record<number, { can_edit_all: boolean; can_override_flow: boolean }> = {}
    roles.forEach((role) => {
      const row = byRoleId.get(role.id)
      nextPermissionDrafts[role.id] = {
        can_edit_all: Boolean(row?.can_edit_all),
        can_override_flow: Boolean(row?.can_override_flow),
      }
    })
    setPermissionDrafts(nextPermissionDrafts)

    const nextStageDrafts = (stagesRes || []).map((stage) => ({
      id: stage.id,
      name: stage.name,
      order: stage.order,
      roles: (stage.roles || []).map((r) => ({ role_id: r.role_id, rankText: String(r.rank) })),
      users: (stage.users || [])
        .map((u) => ({
          user_id: u.user_id,
          username: String(u.username || '').trim() || undefined,
          label: String(u.name || '').trim() || (String(u.username || '').trim() || undefined),
        }))
        .filter((u) => Boolean(u.user_id || u.username)),
    }))
    setStageDrafts(normalizeStageOrders(nextStageDrafts.slice().sort((a, b) => (a.order || 0) - (b.order || 0))))
    setSelectedStageIndex(0)
  }

  function switchTab(nextTab: TabKey) {
    setTab(nextTab)
    navigate(`/iqac/applications-admin?tab=${encodeURIComponent(nextTab)}`)
  }

  function flash(message: string) {
    setNotice(message)
    window.setTimeout(() => setNotice(null), 2500)
  }

  async function saveType() {
    try {
      setBusy('type')
      setError(null)
      if (typeDraft.id) {
        await updateApplicationTypeAdmin(typeDraft.id, typeDraft)
        flash('Application type updated.')
      } else {
        const created = await createApplicationTypeAdmin(typeDraft)
        setSelectedTypeId(created.id)
        flash('Application type created.')
      }
      setTypeDraft(emptyTypeDraft())
      await refreshBase(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to save application type.')
    } finally {
      setBusy('')
    }
  }

  async function saveField() {
    if (!selectedTypeId) return
    try {
      setBusy('field')
      setError(null)
      const payload = {
        field_key: fieldDraft.field_key,
        label: fieldDraft.label,
        field_type: fieldDraft.field_type,
        is_required: fieldDraft.is_required,
        order: fieldDraft.order,
        meta: parseMeta(fieldDraft.metaText),
      }
      if (fieldDraft.id) {
        await updateApplicationFieldAdmin(fieldDraft.id, payload)
        flash('Field updated.')
      } else {
        await createApplicationFieldAdmin(selectedTypeId, payload)
        flash('Field created.')
      }
      await refreshSelectedTypeDetail(selectedTypeId)
      await refreshBase()
      setFieldDraft(emptyFieldDraft((fields[fields.length - 1]?.order || 0) + 1))
    } catch (e: any) {
      setError(e?.message || 'Failed to save field.')
    } finally {
      setBusy('')
    }
  }

  async function moveField(fieldId: number, direction: -1 | 1) {
    if (!selectedTypeId) return
    const index = fields.findIndex((row) => row.id === fieldId)
    const swapIndex = index + direction
    if (index < 0 || swapIndex < 0 || swapIndex >= fields.length) return
    const next = [...fields]
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
    try {
      setBusy('reorder-fields')
      const updated = await reorderApplicationFieldsAdmin(selectedTypeId, next.map((row) => row.id))
      setFields(updated)
      flash('Field order updated.')
    } catch (e: any) {
      setError(e?.message || 'Failed to reorder fields.')
    } finally {
      setBusy('')
    }
  }

  async function removeField(fieldId: number) {
    if (!window.confirm('Delete this field? Existing application data linked to this field may be impacted.')) return
    try {
      setBusy(`delete-field-${fieldId}`)
      await deleteApplicationFieldAdmin(fieldId)
      await refreshSelectedTypeDetail()
      await refreshBase()
      flash('Field deleted.')
    } catch (e: any) {
      setError(e?.message || 'Failed to delete field.')
    } finally {
      setBusy('')
    }
  }

  async function createVersionSnapshot() {
    if (!selectedTypeId) return
    try {
      setBusy('version')
      await createApplicationVersionAdmin(selectedTypeId)
      await refreshSelectedTypeDetail(selectedTypeId)
      await refreshBase()
      flash('New schema version generated from current fields.')
    } catch (e: any) {
      setError(e?.message || 'Failed to create schema version.')
    } finally {
      setBusy('')
    }
  }

  async function activateVersion(versionId: number) {
    try {
      setBusy(`activate-version-${versionId}`)
      await activateApplicationVersionAdmin(versionId)
      await refreshSelectedTypeDetail()
      await refreshBase()
      flash('Schema version activated.')
    } catch (e: any) {
      setError(e?.message || 'Failed to activate schema version.')
    } finally {
      setBusy('')
    }
  }

  async function createFlow() {
    if (!selectedTypeId) return
    try {
      setBusy('create-flow')
      await createApplicationFlowAdmin(selectedTypeId, {
        department_id: newFlowDraft.department_id ? Number(newFlowDraft.department_id) : null,
        is_active: newFlowDraft.is_active,
        override_role_ids: newFlowDraft.override_role_ids,
      })
      setNewFlowDraft({ department_id: '', is_active: true, override_role_ids: [] })
      await refreshSelectedTypeDetail(selectedTypeId)
      await refreshBase()
      flash('Approval flow created.')
    } catch (e: any) {
      setError(e?.message || 'Failed to create flow.')
    } finally {
      setBusy('')
    }
  }

  async function saveFlow(flowId: number) {
    const draft = flowDrafts[flowId]
    if (!draft) return
    try {
      setBusy(`save-flow-${flowId}`)
      await updateApplicationFlowAdmin(flowId, { ...draft, sla_hours: draft.sla_hours ? Number(draft.sla_hours) : null })
      await refreshSelectedTypeDetail()
      await refreshBase()
      flash('Approval flow updated.')
    } catch (e: any) {
      setError(e?.message || 'Failed to update flow.')
    } finally {
      setBusy('')
    }
  }

  async function ensureEscalationNextStep(flowId: number, stepId: number, draftOverride?: StepDraft) {
    const draft = draftOverride || stepDrafts[stepId]
    if (!draft) return

    // Final step has no next.
    if (draft.is_final) return

    // Only build chain when an escalation role is selected.
    if (!draft.escalate_to_role_id) return

    const ordered = [...(await fetchApplicationStepsAdmin(flowId))].sort((a, b) => (a.order || 0) - (b.order || 0))
    const desiredNextRoleId = Number(draft.escalate_to_role_id)
    const desiredNextIsFinal = draft.next_step_type === 'FINAL'
    const nextOrder = Number(draft.order) + 1

    if (desiredNextIsFinal) {
      const existingFinals = ordered.filter((s) => Boolean((s as any).is_final))
      const illegalFinal = existingFinals.find((s) => !((s.order || 0) === nextOrder && s.role_id === desiredNextRoleId))
      if (illegalFinal) throw new Error('Only one final step is allowed. Delete the existing final step first.')
      const later = ordered.filter((s) => (s.order || 0) > nextOrder)
      if (later.length) {
        throw new Error('To set the next step as FINAL, delete steps after the next step first.')
      }
    }

    const existingAtNext = ordered.find((s) => (s.order || 0) === nextOrder)

    // Case 1: Next step already exists and matches the desired role.
    if (existingAtNext && existingAtNext.role_id === desiredNextRoleId) {
      const needsFinalChange = Boolean((existingAtNext as any).is_final) !== desiredNextIsFinal
      const needsClearEsc = desiredNextIsFinal && existingAtNext.escalate_to_role_id
      if (needsFinalChange || needsClearEsc) {
        await updateApplicationStepAdmin(existingAtNext.id, {
          is_final: desiredNextIsFinal,
          escalate_to_role_id: desiredNextIsFinal ? null : existingAtNext.escalate_to_role_id ?? null,
        })
      }
      return
    }

    // Case 2: We need to insert a new step at nextOrder.
    // Shift steps at/after nextOrder down by 1 (descending to avoid unique conflicts).
    const toShift = ordered
      .filter((s) => (s.order || 0) >= nextOrder)
      .sort((a, b) => (b.order || 0) - (a.order || 0))

    for (const s of toShift) {
      await updateApplicationStepAdmin(s.id, { order: Number(s.order) + 1 })
    }

    await createApplicationStepAdmin(flowId, {
      order: nextOrder,
      role_id: desiredNextRoleId,
      sla_hours: null,
      escalate_to_role_id: null,
      is_final: desiredNextIsFinal,
      can_override: false,
      auto_skip_if_unavailable: false,
    })
  }

  async function saveStep(flowId: number, stepId: number) {
    const draft = stepDrafts[stepId]
    if (!draft) return
    try {
      setBusy(`save-step-${stepId}`)
      await updateApplicationStepAdmin(stepId, {
        order: draft.order,
        role_id: draft.stage_id ? null : draft.role_id,
        stage_id: draft.stage_id,
        sla_hours: draft.sla_hours ? Number(draft.sla_hours) : null,
        escalate_to_role_id: draft.is_final ? null : draft.escalate_to_role_id,
        is_final: draft.is_final,
        can_override: draft.can_override,
        auto_skip_if_unavailable: draft.auto_skip_if_unavailable,
      })

      // Auto-build the next step based on this step's escalation role + override/final choice.
      await ensureEscalationNextStep(flowId, stepId)

      await refreshSelectedTypeDetail()
      flash(`Step saved for flow ${flowId}.`)
    } catch (e: any) {
      setError(e?.message || 'Failed to save step.')
    } finally {
      setBusy('')
    }
  }

  async function addStep(flowId: number) {
    const draft = newStepDrafts[flowId]
    if (!draft) return
    try {
      setBusy(`add-step-${flowId}`)
      const created = await createApplicationStepAdmin(flowId, {
        order: draft.order,
        role_id: draft.stage_id ? null : draft.role_id,
        stage_id: draft.stage_id,
        sla_hours: draft.sla_hours ? Number(draft.sla_hours) : null,
        escalate_to_role_id: draft.escalate_to_role_id,
        is_final: false,
        can_override: draft.can_override,
        auto_skip_if_unavailable: draft.auto_skip_if_unavailable,
      })

      // If the first step already has an escalation configured, auto-build the next step immediately.
      await ensureEscalationNextStep(
        flowId,
        created.id,
        {
          ...toStepDraft(created),
          next_step_type: draft.next_step_type,
          escalate_to_role_id: draft.escalate_to_role_id,
        }
      )

      await refreshSelectedTypeDetail()
      flash('Approval step added.')
    } catch (e: any) {
      setError(e?.message || 'Failed to add step.')
    } finally {
      setBusy('')
    }
  }

  async function removeStep(stepId: number) {
    if (!window.confirm('Delete this approval step?')) return
    try {
      setBusy(`delete-step-${stepId}`)
      await deleteApplicationStepAdmin(stepId)
      await refreshSelectedTypeDetail()
      flash('Approval step deleted.')
    } catch (e: any) {
      setError(e?.message || 'Failed to delete step.')
    } finally {
      setBusy('')
    }
  }

  async function savePermissions() {
    if (!selectedTypeId) return
    try {
      setBusy('permissions')
      const items = roles.map((role) => ({
        role_id: role.id,
        can_edit_all: Boolean(permissionDrafts[role.id]?.can_edit_all),
        can_override_flow: Boolean(permissionDrafts[role.id]?.can_override_flow),
      }))
      await saveApplicationRolePermissionsAdmin(selectedTypeId, items)
      await refreshSelectedTypeDetail(selectedTypeId)
      flash('Role permissions saved.')
    } catch (e: any) {
      setError(e?.message || 'Failed to save role permissions.')
    } finally {
      setBusy('')
    }
  }

  async function saveHierarchyStages() {
    if (!selectedTypeId) return
    try {
      setBusy('hierarchy-stages')
      setError(null)

      const payload = stageDrafts
        .map((s, idx) => ({
          id: s.id,
          name: String(s.name || '').trim() || `Stage ${idx + 1}`,
          order: idx + 1,
          roles: (s.roles || [])
            .map((r) => {
              const raw = String(r.rankText ?? '').trim()
              if (!raw) return null
              const rank = Number(raw)
              if (!Number.isFinite(rank) || rank < 0) {
                throw new Error(`Invalid rank for role_id=${r.role_id} in stage ${s.name || idx + 1}`)
              }
              return { role_id: r.role_id, rank: Math.floor(rank) }
            })
            .filter(Boolean) as Array<{ role_id: number; rank: number }>,
          users: (s.users || [])
            .map((u) => ({
              user_id: u.user_id,
              username: u.user_id ? undefined : (String(u.username || '').trim() || undefined),
            }))
            .filter((u) => Boolean(u.user_id || u.username)),
        }))

      await saveApplicationRoleHierarchyStagesAdmin(selectedTypeId, payload)
      await refreshSelectedTypeDetail(selectedTypeId)
      flash('Role hierarchy stages saved.')
    } catch (e: any) {
      setError(e?.message || 'Failed to save role hierarchy stages.')
    } finally {
      setBusy('')
    }
  }

  async function toggleNotificationSetting(key: keyof NotificationSettingsRow, value: boolean) {
    if (!selectedTypeId || !notificationSettings) return
    try {
      setBusy(`notif-${key}`)
      const updated = await updateApplicationNotificationSettings(selectedTypeId, { [key]: value })
      setNotificationSettings(updated)
      flash('Notification setting updated.')
    } catch (e: any) {
      setError(e?.message || 'Failed to update notification setting.')
    } finally {
      setBusy('')
    }
  }

  async function saveNotificationTemplate(key: string, value: string) {
    if (!selectedTypeId) return
    try {
      setBusy('notif-template')
      const updated = await updateApplicationNotificationSettings(selectedTypeId, { [key]: value })
      setNotificationSettings(updated)
      setEditingTemplate(null)
      flash('Message template saved.')
    } catch (e: any) {
      setError(e?.message || 'Failed to save message template.')
    } finally {
      setBusy('')
    }
  }

  const orderedStagesForStarter = useMemo(() => {
    const stages = [...(roleHierarchyStages || [])].sort((a, b) => (a.order || 0) - (b.order || 0))
    return stages.map((s) => ({
      ...s,
      roles: [...(s.roles || [])].sort((a, b) => (a.rank || 0) - (b.rank || 0)),
    }))
  }, [roleHierarchyStages])

  const flowRoleSelectGroups = useMemo(() => {
    const stagesSorted = [...(roleHierarchyStages || [])].sort((a, b) => (a.order || 0) - (b.order || 0))
    const roleNameById = new Map<number, string>()
    ;(roles || []).forEach((r) => {
      roleNameById.set(r.id, r.name)
    })

    const stageGroups = stagesSorted
      .map((s) => {
        const stageRoles = [...(s.roles || [])]
          .sort((a, b) => (a.rank || 0) - (b.rank || 0))
          .map((r) => ({
            role_id: r.role_id,
            role_name: r.role_name || roleNameById.get(r.role_id) || `Role ${r.role_id}`,
          }))
        const uniq: Array<{ role_id: number; role_name: string }> = []
        const seen = new Set<number>()
        for (const row of stageRoles) {
          if (!row.role_id || seen.has(row.role_id)) continue
          seen.add(row.role_id)
          uniq.push(row)
        }
        return { id: s.id, name: s.name, roles: uniq }
      })

    const stageRoleIds = new Set<number>()
    stageGroups.forEach((g) => g.roles.forEach((r) => stageRoleIds.add(r.role_id)))
    const remainingRoles = (roles || [])
      .filter((r) => !stageRoleIds.has(r.id))
      .map((r) => ({ role_id: r.id, role_name: r.name }))

    return { stageGroups, remainingRoles }
  }, [roleHierarchyStages, roles])

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'types', label: 'Application Types' },
    { key: 'fields', label: 'Fields' },
    { key: 'versions', label: 'Schema Versions' },
    { key: 'starter-final', label: 'Starter/Final Roles' },
    { key: 'flows', label: 'Approval Flows' },
    { key: 'hierarchy', label: 'Role Hierarchy' },
    { key: 'permissions', label: 'Role Permissions' },
    { key: 'notifications', label: 'WhatsApp Notifications' },
    { key: 'submissions', label: 'Submissions' },
  ]

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Applications Admin</h1>
            <p className="text-sm text-gray-500 mt-1">IQAC control plane for dynamic application forms, schema versions, workflows, and role permissions.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 font-medium">IQAC Only</span>
            {selectedType ? <span className="px-2.5 py-1 rounded-full bg-white border border-gray-200 text-gray-600">Selected: {selectedType.code}</span> : null}
          </div>
        </div>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div> : null}

        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => switchTab(item.key)}
              className={`px-3 py-2 rounded-xl text-sm font-medium border transition-colors ${tab === item.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          <div className="xl:col-span-3 space-y-4">
            <SectionCard title="Application Types" subtitle="Database-backed form definitions. Select one to manage its fields, versions, flows, and permissions.">
              {loadingBase ? (
                <div className="text-sm text-gray-500">Loading application types…</div>
              ) : (
                <div className="space-y-2">
                  {types.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setSelectedTypeId(row.id)}
                      className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${selectedTypeId === row.id ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{row.name}</div>
                          <div className="text-xs text-gray-500 mt-1">{row.code}</div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusPillClass(row.is_active)}`}>{row.is_active ? 'Active' : 'Inactive'}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-gray-500">
                        <div>Fields: <span className="font-semibold text-gray-700">{row.field_count}</span></div>
                        <div>Schema: <span className="font-semibold text-gray-700">{row.active_form_version ?? '—'}</span></div>
                        <div>Flows: <span className="font-semibold text-gray-700">{row.has_active_flow ? 'Yes' : 'No'}</span></div>
                      </div>
                    </button>
                  ))}
                  {!types.length && <div className="text-sm text-gray-500">No application types configured yet.</div>}
                </div>
              )}
            </SectionCard>

            <SectionCard title={typeDraft.id ? 'Edit Type' : 'New Type'} subtitle="Create or update the top-level application type.">
              <div className="space-y-3">
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Name" value={typeDraft.name} onChange={(e) => setTypeDraft((v) => ({ ...v, name: e.target.value }))} />
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase" placeholder="Code" value={typeDraft.code} onChange={(e) => setTypeDraft((v) => ({ ...v, code: e.target.value.toUpperCase() }))} />
                <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[84px]" placeholder="Description" value={typeDraft.description} onChange={(e) => setTypeDraft((v) => ({ ...v, description: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={typeDraft.is_active} onChange={(e) => setTypeDraft((v) => ({ ...v, is_active: e.target.checked }))} />
                  Active application type
                </label>
                <div className="flex gap-2">
                  <button type="button" disabled={busy === 'type'} onClick={saveType} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg px-4 py-2 text-sm font-medium">{busy === 'type' ? 'Saving…' : typeDraft.id ? 'Update Type' : 'Create Type'}</button>
                  <button type="button" onClick={() => setTypeDraft(emptyTypeDraft())} className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Reset</button>
                </div>
                {selectedType ? (
                  <button type="button" onClick={() => setTypeDraft({ id: selectedType.id, name: selectedType.name, code: selectedType.code, description: selectedType.description || '', is_active: selectedType.is_active })} className="w-full border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Load Selected Type Into Editor</button>
                ) : null}
              </div>
            </SectionCard>
          </div>

          <div className="xl:col-span-9 space-y-4">
            {tab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Application Types', value: overview?.summary.application_types ?? 0 },
                    { label: 'Active Flows', value: overview?.summary.active_flows ?? 0 },
                    { label: 'Schema Versions', value: overview?.summary.schema_versions ?? 0 },
                    { label: 'Submissions', value: overview?.summary.submissions ?? 0 },
                  ].map((card) => (
                    <div key={card.label} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                      <div className="text-xs text-gray-500">{card.label}</div>
                      <div className="text-2xl font-bold text-gray-900 mt-2">{card.value}</div>
                    </div>
                  ))}
                </div>

                <SectionCard title="System Layers" subtitle="These are the exact operating layers IQAC now manages through this UI.">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      ['Form definitions', 'Database records: ApplicationType + ApplicationField'],
                      ['Schema rendering', 'Application type + fields + active form version'],
                      ['Workflow', 'Approval flow records + ordered approval steps'],
                      ['Attachments and history', 'Layered operational data on top of application submissions'],
                    ].map(([title, desc]) => (
                      <div key={title} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="text-sm font-semibold text-gray-900">{title}</div>
                        <div className="text-sm text-gray-600 mt-1">{desc}</div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Configuration Warnings" subtitle="These indicate gaps in the dynamic application setup.">
                  {!overview?.warnings?.length ? (
                    <div className="text-sm text-green-700">No configuration warnings right now.</div>
                  ) : (
                    <div className="space-y-2">
                      {overview.warnings.map((warn, idx) => (
                        <div key={`${warn.type_id}-${idx}`} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                          <div className="text-sm font-medium text-amber-900">{warn.type_name}</div>
                          <div className="text-sm text-amber-700 mt-1">{warn.message}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>
            )}

            {tab === 'types' && (
              <SectionCard title="Application Type Registry" subtitle="All available forms live as database records. Toggle active state instead of deleting production types.">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Code</th>
                        <th className="py-2 pr-3">Active</th>
                        <th className="py-2 pr-3">Fields</th>
                        <th className="py-2 pr-3">Active Schema</th>
                        <th className="py-2 pr-3">Submissions</th>
                        <th className="py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {types.map((row) => (
                        <tr key={row.id} className="border-b border-gray-50">
                          <td className="py-3 pr-3 text-gray-900 font-medium">{row.name}</td>
                          <td className="py-3 pr-3 font-mono text-xs text-gray-600">{row.code}</td>
                          <td className="py-3 pr-3">{row.is_active ? 'Yes' : 'No'}</td>
                          <td className="py-3 pr-3">{row.field_count}</td>
                          <td className="py-3 pr-3">{row.active_form_version ?? '—'}</td>
                          <td className="py-3 pr-3">{row.submission_count}</td>
                          <td className="py-3">
                            <button type="button" className="text-indigo-600 hover:text-indigo-700 font-medium" onClick={() => { setSelectedTypeId(row.id); setTypeDraft({ id: row.id, name: row.name, code: row.code, description: row.description || '', is_active: row.is_active }); }}>Edit</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            )}

            {tab === 'fields' && (
              <div className="grid grid-cols-1 2xl:grid-cols-5 gap-4">
                <div className="2xl:col-span-3">
                  <SectionCard title="Field Definitions" subtitle="These database records define the live form structure for the selected application type.">
                    {!selectedType ? (
                      <div className="text-sm text-gray-500">Select an application type first.</div>
                    ) : loadingDetail ? (
                      <div className="text-sm text-gray-500">Loading fields…</div>
                    ) : (
                      <div className="space-y-2">
                        {fields.map((field) => (
                          <div key={field.id} className="rounded-xl border border-gray-200 px-4 py-3 bg-gray-50">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold text-gray-900">{field.label}</span>
                                  <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-xs text-gray-600">{field.field_type}</span>
                                  {field.is_required ? <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs">Required</span> : null}
                                </div>
                                <div className="text-xs font-mono text-gray-500 mt-1">{field.field_key}</div>
                                <div className="text-xs text-gray-500 mt-2">Order: {field.order}</div>
                              </div>
                              <div className="flex gap-2 flex-wrap">
                                <button type="button" className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-white" onClick={() => moveField(field.id, -1)}>Up</button>
                                <button type="button" className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-600 hover:bg-white" onClick={() => moveField(field.id, 1)}>Down</button>
                                <button type="button" className="border border-indigo-200 bg-indigo-50 rounded-lg px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-100" onClick={() => setFieldDraft({ id: field.id, field_key: field.field_key, label: field.label, field_type: field.field_type, is_required: field.is_required, order: field.order, metaText: jsonPretty(field.meta) })}>Edit</button>
                                <button type="button" className="border border-red-200 bg-red-50 rounded-lg px-3 py-1.5 text-xs text-red-700 hover:bg-red-100" onClick={() => removeField(field.id)} disabled={busy === `delete-field-${field.id}`}>Delete</button>
                              </div>
                            </div>
                            <pre className="mt-3 text-xs bg-white border border-gray-200 rounded-lg p-3 text-gray-600 overflow-auto">{jsonPretty(field.meta)}</pre>
                          </div>
                        ))}
                        {!fields.length && <div className="text-sm text-gray-500">No fields configured for this type yet.</div>}
                      </div>
                    )}
                  </SectionCard>
                </div>
                <div className="2xl:col-span-2">
                  <SectionCard title={fieldDraft.id ? 'Edit Field' : 'New Field'} subtitle="Field metadata is stored as JSON and becomes part of the published schema version.">
                    {!selectedType ? (
                      <div className="text-sm text-gray-500">Select an application type to add fields.</div>
                    ) : (
                      <div className="space-y-3">
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono" placeholder="field_key" value={fieldDraft.field_key} onChange={(e) => setFieldDraft((v) => ({ ...v, field_key: e.target.value }))} />
                        <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Label" value={fieldDraft.label} onChange={(e) => setFieldDraft((v) => ({ ...v, label: e.target.value }))} />
                        <div className="grid grid-cols-2 gap-3">
                          <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={fieldDraft.field_type} onChange={(e) => setFieldDraft((v) => ({ ...v, field_type: e.target.value, metaText: getDefaultMetaForFieldType(e.target.value) }))}>
                            {['TEXT', 'DATE', 'TIME', 'DATE IN OUT', 'DATE OUT IN', 'BOOLEAN', 'FILE', 'NUMBER', 'SELECT'].map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                          <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" value={fieldDraft.order} onChange={(e) => setFieldDraft((v) => ({ ...v, order: Number(e.target.value || 0) }))} placeholder="Order" />
                        </div>
                        {(fieldDraft.field_type === 'DATE IN OUT' || fieldDraft.field_type === 'DATE OUT IN') && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                            <div className="font-semibold mb-1">Composite Field: {fieldDraft.field_type}</div>
                            <div>This field will render with three sub-components:</div>
                            <ul className="mt-1 ml-2 list-disc text-blue-600">
                              <li>DATE - Date field</li>
                              {fieldDraft.field_type === 'DATE IN OUT' ? (
                                <>
                                  <li>IN TIME - Time field</li>
                                  <li>OUT TIME - Time field</li>
                                </>
                              ) : (
                                <>
                                  <li>OUT TIME - Time field</li>
                                  <li>IN TIME - Time field</li>
                                </>
                              )}
                            </ul>
                          </div>
                        )}
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input type="checkbox" checked={fieldDraft.is_required} onChange={(e) => setFieldDraft((v) => ({ ...v, is_required: e.target.checked }))} />
                          Required field
                        </label>
                        <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono min-h-[220px]" value={fieldDraft.metaText} onChange={(e) => setFieldDraft((v) => ({ ...v, metaText: e.target.value }))} />
                        <div className="flex gap-2">
                          <button type="button" onClick={saveField} disabled={busy === 'field'} className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg px-4 py-2 text-sm font-medium">{busy === 'field' ? 'Saving…' : fieldDraft.id ? 'Update Field' : 'Create Field'}</button>
                          <button type="button" onClick={() => setFieldDraft(emptyFieldDraft((fields[fields.length - 1]?.order || 0) + 1))} className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Reset</button>
                        </div>
                      </div>
                    )}
                  </SectionCard>
                </div>
              </div>
            )}

            {tab === 'versions' && (
              <SectionCard title="Schema Versions" subtitle="Publish a snapshot from current field definitions to create a stable renderable schema.">
                <div className="flex justify-end mb-4">
                  <button type="button" onClick={createVersionSnapshot} disabled={!selectedType || busy === 'version'} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg px-4 py-2 text-sm font-medium">{busy === 'version' ? 'Generating…' : 'Generate Version From Fields'}</button>
                </div>
                <div className="space-y-3">
                  {versions.map((version) => (
                    <div key={version.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">Version {version.version}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusPillClass(version.is_active)}`}>{version.is_active ? 'Active' : 'Inactive'}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">Created: {new Date(version.created_at).toLocaleString()}</div>
                        </div>
                        {!version.is_active ? (
                          <button type="button" className="border border-indigo-200 bg-indigo-50 rounded-lg px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-100" onClick={() => activateVersion(version.id)} disabled={busy === `activate-version-${version.id}`}>{busy === `activate-version-${version.id}` ? 'Activating…' : 'Activate'}</button>
                        ) : null}
                      </div>
                      <pre className="mt-3 text-xs bg-white border border-gray-200 rounded-lg p-3 overflow-auto">{jsonPretty(version.schema)}</pre>
                    </div>
                  ))}
                  {!versions.length && <div className="text-sm text-gray-500">No schema versions published yet.</div>}
                </div>
              </SectionCard>
            )}

            {tab === 'starter-final' && (
              <div className="space-y-4">
                <SectionCard title="Starter/Final roles" subtitle="Starter role = Step 1 filler/submission role. Final role = final approver.">
                  <div className="text-sm text-gray-600">
                    Configure Step 1 as the filler role (e.g., STUDENT). Configure the chain until the final approver is marked as Final.
                  </div>
                </SectionCard>

                <SectionCard title="Starter role priority (from Role Hierarchy stages)" subtitle="Stage order is applied first; role rank is applied inside each stage.">
                  {!orderedStagesForStarter.length ? (
                    <div className="text-sm text-gray-500">No Role Hierarchy stages configured for this application type.</div>
                  ) : (
                    <div className="space-y-3">
                      {orderedStagesForStarter.map((stage, idx) => (
                        <div key={stage.id} className="rounded-xl border border-gray-200 bg-white p-4">
                          <div className="text-sm font-semibold text-gray-900">{`Stage ${idx + 1}: ${stage.name}`}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(stage.roles || []).length ? (
                              stage.roles.map((r) => (
                                <span
                                  key={r.id}
                                  className="px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50 text-xs text-gray-700"
                                >
                                  {`${r.role_name || `Role ${r.role_id}`} (rank ${r.rank})`}
                                </span>
                              ))
                            ) : (
                              <span className="text-sm text-gray-500">No roles configured in this stage.</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>
            )}

            {tab === 'flows' && (
              <div className="space-y-4">
                <SectionCard title="Create Approval Flow" subtitle="Workflows are stored as approval flow records. You can create global or department-specific flows.">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={newFlowDraft.department_id} onChange={(e) => setNewFlowDraft((v) => ({ ...v, department_id: e.target.value }))}>
                      <option value="">Global flow</option>
                      {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name || dept.short_name || dept.code || `Department ${dept.id}`}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2">
                      <input type="checkbox" checked={newFlowDraft.is_active} onChange={(e) => setNewFlowDraft((v) => ({ ...v, is_active: e.target.checked }))} />
                      Active flow
                    </label>
                    <div className="md:col-span-2 border border-gray-200 rounded-lg px-3 py-2">
                      <div className="text-xs text-gray-500 mb-2">Override roles</div>
                      {roleHierarchyStages.length ? (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {[...roleHierarchyStages].sort((a, b) => (a.order || 0) - (b.order || 0)).map((stage) => {
                            const stageRoleIds = (stage.roles || []).map((r) => r.role_id)
                            const isSelected = stageRoleIds.length > 0 && stageRoleIds.every((id) => newFlowDraft.override_role_ids.includes(id))
                            return (
                              <button
                                key={stage.id}
                                type="button"
                                className={`px-2.5 py-1 rounded-full border text-xs ${isSelected ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                onClick={() => {
                                  if (!stageRoleIds.length) return
                                  setNewFlowDraft((v) => {
                                    const cur = v.override_role_ids || []
                                    const next = isSelected
                                      ? cur.filter((id) => !stageRoleIds.includes(id))
                                      : Array.from(new Set([...cur, ...stageRoleIds]))
                                    return { ...v, override_role_ids: next }
                                  })
                                }}
                              >
                                {stage.name}
                              </button>
                            )
                          })}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {flowRoleSelectGroups.remainingRoles.map((role) => {
                          const checked = newFlowDraft.override_role_ids.includes(role.role_id)
                          return (
                            <label key={role.role_id} className={`px-2.5 py-1 rounded-full border text-xs cursor-pointer ${checked ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}>
                              <input type="checkbox" className="hidden" checked={checked} onChange={(e) => setNewFlowDraft((v) => ({ ...v, override_role_ids: e.target.checked ? [...v.override_role_ids, role.role_id] : v.override_role_ids.filter((id) => id !== role.role_id) }))} />
                              {role.role_name}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setGroupDraft({ name: '', role_ids: [] })
                        setShowGroupModal(true)
                      }}
                      className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
                    >
                      Create Group
                    </button>
                    <button type="button" onClick={createFlow} disabled={!selectedType || busy === 'create-flow'} className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg px-4 py-2 text-sm font-medium">{busy === 'create-flow' ? 'Creating…' : 'Create Flow'}</button>
                  </div>
                </SectionCard>

                {flows.map((flow) => {
                  const flowDraft = flowDrafts[flow.id] || { is_active: flow.is_active, override_role_ids: flow.override_roles.map((r) => r.id), sla_hours: flow.sla_hours == null ? '' : String(flow.sla_hours) }
                  const orderedSteps = [...(flow.steps || [])].sort((a, b) => (a.order || 0) - (b.order || 0))
                  const lastStep = orderedSteps[orderedSteps.length - 1]
                  const lastIsFinal = Boolean(lastStep?.is_final)
                  const starterStep = orderedSteps[0] || null
                  const finalStep = orderedSteps.find((s) => Boolean((s as any)?.is_final)) || (lastIsFinal ? lastStep : null)
                  const starterRoleName = starterStep?.stage_name || starterStep?.role_name || null
                  const finalRoleName = finalStep?.stage_name || finalStep?.role_name || null
                  const newStepDraft = newStepDrafts[flow.id] || { order: (lastStep?.order || 0) + 1, role_id: 0, stage_id: null, sla_hours: '', escalate_to_role_id: null, next_step_type: 'OVERRIDE', is_final: false, can_override: false, auto_skip_if_unavailable: false }

                  const isEditing = editingFlowId === flow.id
                  return (
                    <SectionCard
                      key={flow.id}
                      title={`Flow #${flow.id}`}
                      subtitle={
                        <div className="space-y-0.5">
                          <div>{flow.department_name ? `Department-specific flow for ${flow.department_name}.` : 'Global flow used when no department-specific flow exists.'}</div>
                          {finalRoleName ? <div>{`Final: ${finalRoleName}.`}</div> : null}
                          {starterRoleName ? <div>{`Starter: ${starterRoleName}.`}</div> : null}
                        </div>
                      }
                      right={(
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusPillClass(flowDraft.is_active)}`}>{flowDraft.is_active ? 'Active' : 'Inactive'}</span>
                          <button
                            type="button"
                            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            onClick={() => setEditingFlowId((cur) => (cur === flow.id ? null : flow.id))}
                          >
                            {isEditing ? 'Close' : 'Edit'}
                          </button>
                        </div>
                      )}
                    >
                      {!isEditing ? (
                        <div className="text-sm text-gray-600">
                          Click <span className="font-medium">Edit</span> to modify steps.
                        </div>
                      ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <label className="flex items-center gap-2 text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2">
                            <input type="checkbox" checked={flowDraft.is_active} onChange={(e) => setFlowDrafts((v) => ({ ...v, [flow.id]: { ...flowDraft, is_active: e.target.checked } }))} />
                            Flow is active
                          </label>
                          <div className="border border-gray-200 rounded-lg px-3 py-2">
                            <label className="flex flex-col gap-1">
                              <span className="text-xs text-gray-500">SLA Hours (for entire flow)</span>
                              <input
                                type="number"
                                min="0"
                                className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm w-28"
                                placeholder="e.g. 24"
                                value={flowDraft.sla_hours}
                                onChange={(e) => setFlowDrafts((v) => ({ ...v, [flow.id]: { ...flowDraft, sla_hours: e.target.value } }))}
                              />
                            </label>
                          </div>
                          <div className="border border-gray-200 rounded-lg px-3 py-2">
                            <div className="text-xs text-gray-500 mb-2">Override roles</div>
                            {roleHierarchyStages.length ? (
                              <div className="flex flex-wrap gap-2 mb-2">
                                {[...roleHierarchyStages].sort((a, b) => (a.order || 0) - (b.order || 0)).map((stage) => {
                                  const stageRoleIds = (stage.roles || []).map((r) => r.role_id)
                                  const isSelected = stageRoleIds.length > 0 && stageRoleIds.every((id) => flowDraft.override_role_ids.includes(id))
                                  return (
                                    <button
                                      key={stage.id}
                                      type="button"
                                      className={`px-2.5 py-1 rounded-full border text-xs ${isSelected ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                      onClick={() => {
                                        if (!stageRoleIds.length) return
                                        setFlowDrafts((v) => {
                                          const cur = flowDraft.override_role_ids || []
                                          const next = isSelected
                                            ? cur.filter((id) => !stageRoleIds.includes(id))
                                            : Array.from(new Set([...cur, ...stageRoleIds]))
                                          return { ...v, [flow.id]: { ...flowDraft, override_role_ids: next } }
                                        })
                                      }}
                                    >
                                      {stage.name}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              {flowRoleSelectGroups.remainingRoles.map((role) => {
                                const checked = flowDraft.override_role_ids.includes(role.role_id)
                                return (
                                  <label key={role.role_id} className={`px-2.5 py-1 rounded-full border text-xs cursor-pointer ${checked ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}>
                                    <input type="checkbox" className="hidden" checked={checked} onChange={(e) => setFlowDrafts((v) => ({ ...v, [flow.id]: { ...flowDraft, override_role_ids: e.target.checked ? [...flowDraft.override_role_ids, role.role_id] : flowDraft.override_role_ids.filter((id) => id !== role.role_id) } }))} />
                                    {role.role_name}
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button type="button" onClick={() => saveFlow(flow.id)} disabled={busy === `save-flow-${flow.id}`} className="border border-indigo-200 bg-indigo-50 rounded-lg px-4 py-2 text-sm text-indigo-700 hover:bg-indigo-100">{busy === `save-flow-${flow.id}` ? 'Saving…' : 'Save Flow'}</button>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-gray-500 border-b border-gray-100">
                                <th className="py-2 pr-3">Order</th>
                                <th className="py-2 pr-3">Role</th>
                                <th className="py-2 pr-3">Escalate To</th>
                                <th className="py-2 pr-3">Next Step</th>
                                <th className="py-2 pr-3">Flags</th>
                                <th className="py-2">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orderedSteps.map((step, idx) => {
                                const nextStep = orderedSteps[idx + 1] || null
                                const stepDraft = stepDrafts[step.id] || toStepDraft(step, nextStep)
                                const isStarter = idx === 0
                                const isFinal = Boolean(stepDraft.is_final)
                                return (
                                  <tr key={step.id} className="border-b border-gray-50 align-top">
                                    <td className="py-3 pr-3"><input type="number" className="w-20 border border-gray-200 rounded-lg px-2 py-1.5" value={stepDraft.order} onChange={(e) => setStepDrafts((v) => ({ ...v, [step.id]: { ...stepDraft, order: Number(e.target.value || 0) } }))} /></td>
                                    <td className="py-3 pr-3">
                                      <div className="flex items-center gap-2">
                                        <select
                                          className="border border-gray-200 rounded-lg px-2 py-1.5 min-w-[150px]"
                                          value={stepDraft.stage_id ? -Number(stepDraft.stage_id) : stepDraft.role_id}
                                          onChange={(e) => {
                                            const selected = Number(e.target.value || 0)
                                            setStepDrafts((v) => ({
                                              ...v,
                                              [step.id]: {
                                                ...stepDraft,
                                                role_id: selected < 0 ? 0 : selected,
                                                stage_id: selected < 0 ? Math.abs(selected) : null,
                                              },
                                            }))
                                          }}
                                        >
                                          <option value={0}>Select role</option>
                                          {flowRoleSelectGroups.stageGroups.length ? (
                                            <optgroup label="Stages">
                                              {flowRoleSelectGroups.stageGroups.map((g) => (
                                                <option key={`stage-${g.id}`} value={-Number(g.id)}>{g.name}</option>
                                              ))}
                                            </optgroup>
                                          ) : null}
                                          {flowRoleSelectGroups.stageGroups.map((g) => (
                                            <optgroup key={g.id} label={g.name}>
                                              {g.roles.map((r) => (
                                                <option key={`stage-${g.id}-role-${r.role_id}`} value={r.role_id}>{r.role_name}</option>
                                              ))}
                                            </optgroup>
                                          ))}
                                          <optgroup label="All roles">
                                            {flowRoleSelectGroups.remainingRoles.map((r) => (
                                              <option key={`role-${r.role_id}`} value={r.role_id}>{r.role_name}</option>
                                            ))}
                                          </optgroup>
                                        </select>
                                        {isStarter ? (
                                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 border border-indigo-200 text-indigo-700">Starter</span>
                                        ) : null}
                                        {isFinal ? (
                                          <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-50 border border-green-200 text-green-700">Final</span>
                                        ) : null}
                                      </div>
                                    </td>
                                    <td className="py-3 pr-3">
                                      {stepDraft.is_final ? (
                                        <div className="text-xs text-gray-500 pt-2">Final approver</div>
                                      ) : (
                                        <select
                                          className="border border-gray-200 rounded-lg px-2 py-1.5 min-w-[150px]"
                                          value={stepDraft.escalate_to_role_id ?? ''}
                                          onChange={(e) => setStepDrafts((v) => ({
                                            ...v,
                                            [step.id]: {
                                              ...stepDraft,
                                              escalate_to_role_id: e.target.value ? Number(e.target.value) : null,
                                              next_step_type: stepDraft.next_step_type || 'OVERRIDE',
                                            },
                                          }))}
                                        >
                                          <option value="">Select escalation role</option>
                                          {flowRoleSelectGroups.stageGroups.map((g) => (
                                            <optgroup key={g.id} label={g.name}>
                                              {g.roles.map((r) => (
                                                <option key={`stage-${g.id}-esc-${r.role_id}`} value={r.role_id}>{r.role_name}</option>
                                              ))}
                                            </optgroup>
                                          ))}
                                          <optgroup label="All roles">
                                            {flowRoleSelectGroups.remainingRoles.map((r) => (
                                              <option key={`esc-${r.role_id}`} value={r.role_id}>{r.role_name}</option>
                                            ))}
                                          </optgroup>
                                        </select>
                                      )}
                                    </td>
                                    <td className="py-3 pr-3">
                                      {stepDraft.is_final ? (
                                        <div className="text-xs text-gray-500 pt-2">—</div>
                                      ) : !stepDraft.escalate_to_role_id ? (
                                        <div className="text-xs text-gray-500 pt-2">Select escalation role to choose Override/Final</div>
                                      ) : (
                                        <div className="flex items-center gap-4 pt-1">
                                          <label className="flex items-center gap-2 text-xs text-gray-700">
                                            <input
                                              type="radio"
                                              name={`next-step-type-${step.id}`}
                                              checked={stepDraft.next_step_type === 'OVERRIDE'}
                                              onChange={() => setStepDrafts((v) => ({ ...v, [step.id]: { ...stepDraft, next_step_type: 'OVERRIDE' } }))}
                                            />
                                            Override
                                          </label>
                                          <label className="flex items-center gap-2 text-xs text-gray-700">
                                            <input
                                              type="radio"
                                              name={`next-step-type-${step.id}`}
                                              checked={stepDraft.next_step_type === 'FINAL'}
                                              onChange={() => setStepDrafts((v) => ({ ...v, [step.id]: { ...stepDraft, next_step_type: 'FINAL' } }))}
                                            />
                                            Final
                                          </label>
                                        </div>
                                      )}
                                    </td>
                                    <td className="py-3 pr-3">
                                      <label className="block text-xs text-gray-700"><input type="checkbox" checked={stepDraft.can_override} onChange={(e) => setStepDrafts((v) => ({ ...v, [step.id]: { ...stepDraft, can_override: e.target.checked } }))} /> <span className="ml-1">Can override</span></label>
                                      <label className="block text-xs text-gray-700 mt-1"><input type="checkbox" checked={stepDraft.auto_skip_if_unavailable} onChange={(e) => setStepDrafts((v) => ({ ...v, [step.id]: { ...stepDraft, auto_skip_if_unavailable: e.target.checked } }))} /> <span className="ml-1">Auto-skip</span></label>
                                    </td>
                                    <td className="py-3">
                                      <div className="flex gap-2 flex-wrap">
                                        <button type="button" className="border border-indigo-200 bg-indigo-50 rounded-lg px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-100" onClick={() => saveStep(flow.id, step.id)} disabled={busy === `save-step-${step.id}`}>{busy === `save-step-${step.id}` ? 'Saving…' : 'Save'}</button>
                                        <button type="button" className="border border-red-200 bg-red-50 rounded-lg px-3 py-1.5 text-xs text-red-700 hover:bg-red-100" onClick={() => removeStep(step.id)} disabled={busy === `delete-step-${step.id}`}>Delete</button>
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                              {flow.steps.length === 0 ? null : lastIsFinal ? (
                                <tr className="bg-gray-50">
                                  <td className="py-3 pr-3 text-sm text-gray-600" colSpan={6}>Final step is already set as the last step. Remove it to add more steps.</td>
                                </tr>
                              ) : (
                                <tr className="bg-gray-50 align-top">
                                  <td className="py-3 pr-3 text-sm text-gray-600" colSpan={6}>
                                    Steps are added automatically when you set an escalation role and click Save.
                                  </td>
                                </tr>
                              )}

                              {flow.steps.length === 0 ? (
                                <tr className="bg-gray-50 align-top">
                                  <td className="py-3 pr-3"><input type="number" className="w-20 border border-gray-200 rounded-lg px-2 py-1.5" value={newStepDraft.order} onChange={(e) => setNewStepDrafts((v) => ({ ...v, [flow.id]: { ...newStepDraft, order: Number(e.target.value || 0) } }))} /></td>
                                  <td className="py-3 pr-3">
                                    <select
                                      className="border border-gray-200 rounded-lg px-2 py-1.5 min-w-[150px]"
                                      value={newStepDraft.stage_id ? -Number(newStepDraft.stage_id) : newStepDraft.role_id}
                                      onChange={(e) => setNewStepDrafts((v) => ({
                                        ...v,
                                        [flow.id]: {
                                          ...newStepDraft,
                                          role_id: Number(e.target.value || 0) < 0 ? 0 : Number(e.target.value || 0),
                                          stage_id: Number(e.target.value || 0) < 0 ? Math.abs(Number(e.target.value || 0)) : null,
                                        },
                                      }))}
                                    >
                                      <option value={0}>Select role</option>
                                      {flowRoleSelectGroups.stageGroups.length ? (
                                        <optgroup label="Stages">
                                          {flowRoleSelectGroups.stageGroups.map((g) => (
                                            <option key={`new-stage-${g.id}`} value={-Number(g.id)}>{g.name}</option>
                                          ))}
                                        </optgroup>
                                      ) : null}
                                      {flowRoleSelectGroups.stageGroups.map((g) => (
                                        <optgroup key={g.id} label={g.name}>
                                          {g.roles.map((r) => (
                                            <option key={`new-stage-${g.id}-role-${r.role_id}`} value={r.role_id}>{r.role_name}</option>
                                          ))}
                                        </optgroup>
                                      ))}
                                      <optgroup label="All roles">
                                        {flowRoleSelectGroups.remainingRoles.map((r) => (
                                          <option key={`new-role-${r.role_id}`} value={r.role_id}>{r.role_name}</option>
                                        ))}
                                      </optgroup>
                                    </select>
                                    <div className="text-[11px] text-gray-500 mt-1">Step 1 should be the role that fills the application (e.g., STUDENT).</div>
                                  </td>
                                  <td className="py-3 pr-3">
                                    <select
                                      className="border border-gray-200 rounded-lg px-2 py-1.5 min-w-[150px]"
                                      value={newStepDraft.escalate_to_role_id ?? ''}
                                      onChange={(e) => setNewStepDrafts((v) => ({
                                        ...v,
                                        [flow.id]: {
                                          ...newStepDraft,
                                          escalate_to_role_id: e.target.value ? Number(e.target.value) : null,
                                        },
                                      }))}
                                    >
                                      <option value="">Select escalation role</option>
                                      {flowRoleSelectGroups.stageGroups.map((g) => (
                                        <optgroup key={g.id} label={g.name}>
                                          {g.roles.map((r) => (
                                            <option key={`new-stage-${g.id}-esc-${r.role_id}`} value={r.role_id}>{r.role_name}</option>
                                          ))}
                                        </optgroup>
                                      ))}
                                      <optgroup label="All roles">
                                        {flowRoleSelectGroups.remainingRoles.map((r) => (
                                          <option key={`new-esc-${r.role_id}`} value={r.role_id}>{r.role_name}</option>
                                        ))}
                                      </optgroup>
                                    </select>
                                  </td>
                                  <td className="py-3 pr-3">
                                    {!newStepDraft.escalate_to_role_id ? (
                                      <div className="text-xs text-gray-500 pt-2">Select escalation role to choose Override/Final</div>
                                    ) : (
                                      <div className="flex items-center gap-4 pt-1">
                                        <label className="flex items-center gap-2 text-xs text-gray-700">
                                          <input type="radio" name={`new-next-step-type-${flow.id}`} checked={newStepDraft.next_step_type === 'OVERRIDE'} onChange={() => setNewStepDrafts((v) => ({ ...v, [flow.id]: { ...newStepDraft, next_step_type: 'OVERRIDE' } }))} />
                                          Override
                                        </label>
                                        <label className="flex items-center gap-2 text-xs text-gray-700">
                                          <input type="radio" name={`new-next-step-type-${flow.id}`} checked={newStepDraft.next_step_type === 'FINAL'} onChange={() => setNewStepDrafts((v) => ({ ...v, [flow.id]: { ...newStepDraft, next_step_type: 'FINAL' } }))} />
                                          Final
                                        </label>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-3 pr-3">
                                    <label className="block text-xs text-gray-700"><input type="checkbox" checked={newStepDraft.can_override} onChange={(e) => setNewStepDrafts((v) => ({ ...v, [flow.id]: { ...newStepDraft, can_override: e.target.checked } }))} /> <span className="ml-1">Can override</span></label>
                                    <label className="block text-xs text-gray-700 mt-1"><input type="checkbox" checked={newStepDraft.auto_skip_if_unavailable} onChange={(e) => setNewStepDrafts((v) => ({ ...v, [flow.id]: { ...newStepDraft, auto_skip_if_unavailable: e.target.checked } }))} /> <span className="ml-1">Auto-skip</span></label>
                                  </td>
                                  <td className="py-3">
                                    <button
                                      type="button"
                                      className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg px-3 py-1.5 text-xs font-medium"
                                      onClick={() => addStep(flow.id)}
                                      disabled={busy === `add-step-${flow.id}` || (!newStepDraft.role_id && !newStepDraft.stage_id)}
                                    >
                                      {busy === `add-step-${flow.id}` ? 'Adding…' : 'Add Step 1'}
                                    </button>
                                  </td>
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      )}
                    </SectionCard>
                  )
                })}
                {!flows.length && <SectionCard title="Approval Flows"><div className="text-sm text-gray-500">No approval flows configured for the selected application type.</div></SectionCard>}
              </div>
            )}

            {tab === 'hierarchy' && (
              <SectionCard
                title="Role Hierarchy"
                subtitle="Configure hierarchy stages (groups). A user pinned to a stage will always use that stage and ignore role hierarchy. Otherwise the first stage that matches the user's effective roles is used."
              >
                {!selectedType ? (
                  <div className="text-sm text-gray-500">Select an application type first.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                      <div className="lg:col-span-4">
                        <div className="border border-gray-200 rounded-xl bg-gray-50 p-3">
                          <div className="text-xs text-gray-500 mb-2">Stages</div>
                          <div className="space-y-2">
                            {stageDrafts.length === 0 ? (
                              <div className="text-sm text-gray-500">No stages yet. Create one.</div>
                            ) : (
                              stageDrafts.map((stage, idx) => {
                                const active = idx === selectedStageIndex
                                return (
                                  <div
                                    key={stage.id ?? `new-${idx}`}
                                    className={`w-full rounded-xl border px-3 py-2 ${active ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 bg-white hover:bg-gray-100'}`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedStageIndex(idx)}
                                        className="flex-1 text-left"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <div className="text-sm font-semibold text-gray-900">{stage.name || `Stage ${idx + 1}`}</div>
                                          <div className="text-xs text-gray-500">#{stage.order}</div>
                                        </div>
                                        <div className="mt-1 text-xs text-gray-500">Roles: {stage.roles?.length || 0} • Users: {stage.users?.length || 0}</div>
                                      </button>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          className="text-xs border border-gray-200 rounded-md px-2 py-1 hover:bg-white disabled:opacity-50"
                                          disabled={idx === 0}
                                          onClick={() => {
                                            setStageDrafts((v) => {
                                              if (idx <= 0) return v
                                              const next = v.slice()
                                              ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                                              return normalizeStageOrders(next)
                                            })
                                            setSelectedStageIndex((cur) => (cur === idx ? idx - 1 : cur === idx - 1 ? idx : cur))
                                          }}
                                        >
                                          Up
                                        </button>
                                        <button
                                          type="button"
                                          className="text-xs border border-gray-200 rounded-md px-2 py-1 hover:bg-white disabled:opacity-50"
                                          disabled={idx === stageDrafts.length - 1}
                                          onClick={() => {
                                            setStageDrafts((v) => {
                                              if (idx >= v.length - 1) return v
                                              const next = v.slice()
                                              ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
                                              return normalizeStageOrders(next)
                                            })
                                            setSelectedStageIndex((cur) => (cur === idx ? idx + 1 : cur === idx + 1 ? idx : cur))
                                          }}
                                        >
                                          Down
                                        </button>
                                        <button
                                          type="button"
                                          className="text-xs border border-red-200 text-red-700 rounded-md px-2 py-1 hover:bg-red-50"
                                          onClick={() => {
                                            if (!window.confirm('Delete this stage?')) return
                                            setStageDrafts((v) => normalizeStageOrders(v.filter((_, i) => i !== idx)))
                                            setSelectedStageIndex((cur) => {
                                              if (cur === idx) return Math.max(0, idx - 1)
                                              if (cur > idx) return cur - 1
                                              return cur
                                            })
                                          }}
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )
                              })
                            )}
                          </div>

                          <div className="mt-3 flex gap-2">
                            <input
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                              placeholder="New stage name"
                              value={newStageName}
                              onChange={(e) => setNewStageName(e.target.value)}
                            />
                            <button
                              type="button"
                              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 text-sm font-medium"
                              onClick={() => {
                                const name = String(newStageName || '').trim() || `Stage ${stageDrafts.length + 1}`
                                setStageDrafts((v) => normalizeStageOrders([...v, { name, order: v.length + 1, roles: [], users: [] }]))
                                setNewStageName('')
                                setSelectedStageIndex(stageDrafts.length)
                              }}
                            >
                              Add
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="lg:col-span-8">
                        {stageDrafts.length === 0 ? (
                          <div className="text-sm text-gray-500">Create a stage to configure roles/users.</div>
                        ) : (
                          (() => {
                            const stage = stageDrafts[selectedStageIndex]
                            if (!stage) return null
                            const stageKey = stage.id ?? `idx-${selectedStageIndex}`
                            const selectedRolesById = new Map((stage.roles || []).map((r) => [r.role_id, r]))

                            function updateStage(patch: Partial<typeof stage>) {
                              setStageDrafts((v) => v.map((s, i) => (i === selectedStageIndex ? { ...s, ...patch } : s)))
                            }

                            return (
                              <div key={stageKey} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  <div className="md:col-span-2">
                                    <div className="text-xs text-gray-500 mb-1">Stage name</div>
                                    <input
                                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                      value={stage.name}
                                      onChange={(e) => updateStage({ name: e.target.value })}
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <div className="text-xs text-gray-500">Order: <span className="text-gray-900 font-semibold">#{stage.order}</span></div>
                                  </div>
                                </div>

                                <div className="flex justify-between gap-2">
                                  <button
                                    type="button"
                                    className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    onClick={() => {
                                      if (!window.confirm('Delete this stage?')) return
                                      setStageDrafts((v) => normalizeStageOrders(v.filter((_, i) => i !== selectedStageIndex)))
                                      setSelectedStageIndex(0)
                                    }}
                                  >
                                    Delete Stage
                                  </button>
                                  <button
                                    type="button"
                                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg px-4 py-2 text-sm font-medium"
                                    disabled={busy === 'hierarchy-stages'}
                                    onClick={saveHierarchyStages}
                                  >
                                    {busy === 'hierarchy-stages' ? 'Saving…' : 'Save Stages'}
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div className="border border-gray-200 rounded-xl bg-white p-4">
                                    <div className="text-sm font-semibold text-gray-900">Roles in this stage</div>
                                    <div className="text-xs text-gray-500 mt-1">Pick roles and set rank (lower = higher priority). Only these roles participate for this stage.</div>
                                    <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
                                      {roles.map((role) => {
                                        const existing = selectedRolesById.get(role.id)
                                        const checked = Boolean(existing)
                                        return (
                                          <div key={role.id} className="flex items-center justify-between gap-3 border border-gray-100 rounded-lg px-3 py-2">
                                            <label className="flex items-center gap-2">
                                              <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(e) => {
                                                  const nextChecked = e.target.checked
                                                  const nextRoles = [...(stage.roles || [])]
                                                  if (nextChecked) {
                                                    nextRoles.push({ role_id: role.id, rankText: '0' })
                                                  } else {
                                                    const idx = nextRoles.findIndex((r) => r.role_id === role.id)
                                                    if (idx >= 0) nextRoles.splice(idx, 1)
                                                  }
                                                  updateStage({ roles: nextRoles })
                                                }}
                                              />
                                              <span className="text-sm text-gray-800">{role.name}</span>
                                            </label>
                                            <input
                                              type="number"
                                              min={0}
                                              step={1}
                                              disabled={!checked}
                                              className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm disabled:bg-gray-50"
                                              value={existing?.rankText ?? ''}
                                              onChange={(e) => {
                                                const nextRoles = (stage.roles || []).map((r) => r.role_id === role.id ? { ...r, rankText: e.target.value } : r)
                                                updateStage({ roles: nextRoles })
                                              }}
                                            />
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>

                                  <div className="border border-gray-200 rounded-xl bg-white p-4">
                                    <div className="text-sm font-semibold text-gray-900">Users pinned to this stage</div>
                                    <div className="text-xs text-gray-500 mt-1">If a username is listed here, that user will always use this stage (ignores role hierarchy).</div>

                                    <div className="mt-3 flex gap-2">
                                      <input
                                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                                        placeholder="Search user (username / reg no / staff id / email)"
                                        value={newStageUsername}
                                        onChange={(e) => setNewStageUsername(e.target.value)}
                                      />
                                    </div>

                                    {pinnedUserResults.length ? (
                                      <div className="mt-2 border border-gray-200 rounded-lg bg-white overflow-hidden">
                                        <div className="max-h-56 overflow-y-auto">
                                          {pinnedUserResults.map((r) => {
                                            const displayName = String(r.name || '').trim()
                                            const uname = String(r.username || '').trim()
                                            const email = String(r.email || '').trim()
                                            const regNo = String(r.reg_no || '').trim()
                                            const staffId = String(r.staff_id || '').trim()
                                            const labelParts: string[] = []
                                            if (uname) labelParts.push(uname)
                                            if (regNo) labelParts.push(regNo)
                                            if (staffId) labelParts.push(staffId)
                                            if (email) labelParts.push(email)
                                            const sub = labelParts.join(' • ')

                                            return (
                                              <button
                                                key={r.user_id}
                                                type="button"
                                                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                                                onClick={() => {
                                                  const exists = (stage.users || []).some((u) => (u.user_id && u.user_id === r.user_id) || (!u.user_id && u.username && uname && String(u.username).toLowerCase() === uname.toLowerCase()))
                                                  if (exists) {
                                                    setNewStageUsername('')
                                                    setPinnedUserResults([])
                                                    return
                                                  }
                                                  updateStage({
                                                    users: [
                                                      ...(stage.users || []),
                                                      {
                                                        user_id: r.user_id,
                                                        username: uname || undefined,
                                                        label: displayName || uname || regNo || staffId || email || String(r.user_id),
                                                      },
                                                    ],
                                                  })
                                                  setNewStageUsername('')
                                                  setPinnedUserResults([])
                                                }}
                                              >
                                                <div className="text-sm text-gray-900 font-medium">{displayName || uname || 'User'}</div>
                                                {sub ? <div className="text-xs text-gray-500 mt-0.5">{sub}</div> : null}
                                              </button>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    ) : null}

                                    <div className="mt-3 space-y-2">
                                      {(stage.users || []).length === 0 ? (
                                        <div className="text-sm text-gray-500">No pinned users.</div>
                                      ) : (
                                        (stage.users || []).map((u) => (
                                          <div key={String(u.user_id || u.username)} className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2">
                                            <div className="text-sm text-gray-800">{u.label || u.username || String(u.user_id || '')}</div>
                                            <button
                                              type="button"
                                              className="text-xs text-red-600 hover:text-red-700"
                                              onClick={() => updateStage({ users: (stage.users || []).filter((x) => (u.user_id ? x.user_id !== u.user_id : String(x.username || '').toLowerCase() !== String(u.username || '').toLowerCase())) })}
                                            >
                                              Remove
                                            </button>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })()
                        )}
                      </div>
                    </div>
                  </>
                )}
              </SectionCard>
            )}

            {tab === 'permissions' && (
              <SectionCard title="Role Permissions" subtitle="IQAC can configure which roles can edit all submissions or override the approval flow for the selected application type.">
                {!selectedType ? (
                  <div className="text-sm text-gray-500">Select an application type first.</div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b border-gray-100">
                            <th className="py-2 pr-3">Role</th>
                            <th className="py-2 pr-3">Can Edit All</th>
                            <th className="py-2 pr-3">Can Override Flow</th>
                          </tr>
                        </thead>
                        <tbody>
                          {roles.map((role) => (
                            <tr key={role.id} className="border-b border-gray-50">
                              <td className="py-3 pr-3 text-gray-900 font-medium">{role.name}</td>
                              <td className="py-3 pr-3"><input type="checkbox" checked={Boolean(permissionDrafts[role.id]?.can_edit_all)} onChange={(e) => setPermissionDrafts((v) => ({ ...v, [role.id]: { ...v[role.id], can_edit_all: e.target.checked, can_override_flow: Boolean(v[role.id]?.can_override_flow) } }))} /></td>
                              <td className="py-3 pr-3"><input type="checkbox" checked={Boolean(permissionDrafts[role.id]?.can_override_flow)} onChange={(e) => setPermissionDrafts((v) => ({ ...v, [role.id]: { ...v[role.id], can_override_flow: e.target.checked, can_edit_all: Boolean(v[role.id]?.can_edit_all) } }))} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button type="button" className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg px-4 py-2 text-sm font-medium" disabled={busy === 'permissions'} onClick={savePermissions}>{busy === 'permissions' ? 'Saving…' : 'Save Role Permissions'}</button>
                    </div>
                  </>
                )}
              </SectionCard>
            )}

            {tab === 'notifications' && (
              <SectionCard title="WhatsApp Notifications" subtitle="Configure when WhatsApp notifications are sent and customize the message templates for each notification type.">
                {!selectedType ? (
                  <div className="text-sm text-gray-500">Select an application type first.</div>
                ) : loadingDetail ? (
                  <div className="text-sm text-gray-500">Loading notification settings…</div>
                ) : !notificationSettings ? (
                  <div className="text-sm text-gray-500">No notification settings found. Save will create default settings.</div>
                ) : (
                  <div className="space-y-6">
                    {/* Placeholder variables info */}
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <div className="text-sm font-semibold text-blue-900 mb-2">Available Placeholders</div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        {[
                          { key: '{applicant_name}', desc: 'Applicant name' },
                          { key: '{application_type}', desc: 'Application type name' },
                          { key: '{application_id}', desc: 'Application ID' },
                          { key: '{current_role}', desc: 'Current step role' },
                          { key: '{next_role}', desc: 'Next step role' },
                          { key: '{actor_name}', desc: 'Approver name' },
                          { key: '{actor_role}', desc: 'Approver role' },
                          { key: '{remarks}', desc: 'Approval remarks' },
                          { key: '{link}', desc: 'Application link' },
                          { key: '{approver_name}', desc: 'Next approver name' },
                        ].map((p) => (
                          <span key={p.key} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono">
                            {p.key}
                            <span className="text-blue-600 font-normal">({p.desc})</span>
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Notification Cards Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      {/* Card 1: On Submit */}
                      <div className={`rounded-xl border-2 p-5 transition-colors ${notificationSettings.notify_on_submit ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${notificationSettings.notify_on_submit ? 'bg-emerald-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                            </div>
                            <div className="font-semibold text-gray-900">On Submit</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleNotificationSetting('notify_on_submit', !notificationSettings.notify_on_submit)}
                            disabled={busy.startsWith('notif-')}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationSettings.notify_on_submit ? 'bg-emerald-500' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationSettings.notify_on_submit ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">Send WhatsApp message to applicant when their application is submitted.</p>
                        <button
                          type="button"
                          onClick={() => setEditingTemplate({ key: 'submit_template', label: 'Submission Notification', value: notificationSettings.submit_template })}
                          className="w-full text-sm text-indigo-600 hover:text-indigo-700 font-medium border border-indigo-200 rounded-lg px-3 py-2 hover:bg-indigo-50 transition-colors"
                        >
                          Edit Template
                        </button>
                      </div>

                      {/* Card 2: On Status Change */}
                      <div className={`rounded-xl border-2 p-5 transition-colors ${notificationSettings.notify_on_status_change ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${notificationSettings.notify_on_status_change ? 'bg-emerald-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div className="font-semibold text-gray-900">On Approve/Reject</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleNotificationSetting('notify_on_status_change', !notificationSettings.notify_on_status_change)}
                            disabled={busy.startsWith('notif-')}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationSettings.notify_on_status_change ? 'bg-emerald-500' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationSettings.notify_on_status_change ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">Send WhatsApp message to applicant when a stage is approved or rejected.</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingTemplate({ key: 'approve_template', label: 'Approval Message', value: notificationSettings.approve_template })}
                            className="flex-1 text-sm text-emerald-600 hover:text-emerald-700 font-medium border border-emerald-200 rounded-lg px-3 py-2 hover:bg-emerald-50 transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTemplate({ key: 'reject_template', label: 'Rejection Message', value: notificationSettings.reject_template })}
                            className="flex-1 text-sm text-red-600 hover:text-red-700 font-medium border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50 transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </div>

                      {/* Card 3: On Forward */}
                      <div className={`rounded-xl border-2 p-5 transition-colors ${notificationSettings.notify_on_forward ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${notificationSettings.notify_on_forward ? 'bg-emerald-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                            </div>
                            <div className="font-semibold text-gray-900">On Forward</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleNotificationSetting('notify_on_forward', !notificationSettings.notify_on_forward)}
                            disabled={busy.startsWith('notif-')}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationSettings.notify_on_forward ? 'bg-emerald-500' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationSettings.notify_on_forward ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">Send WhatsApp message to next approver and update applicant when application is forwarded.</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingTemplate({ key: 'forward_approver_template', label: 'To Next Approver', value: notificationSettings.forward_approver_template })}
                            className="flex-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium border border-indigo-200 rounded-lg px-3 py-2 hover:bg-indigo-50 transition-colors"
                          >
                            Approver
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTemplate({ key: 'forward_applicant_template', label: 'To Applicant', value: notificationSettings.forward_applicant_template })}
                            className="flex-1 text-sm text-blue-600 hover:text-blue-700 font-medium border border-blue-200 rounded-lg px-3 py-2 hover:bg-blue-50 transition-colors"
                          >
                            Applicant
                          </button>
                        </div>
                      </div>

                      {/* Card 4: On Self Cancellation */}
                      <div className={`rounded-xl border-2 p-5 transition-colors ${notificationSettings.notify_on_cancel ? 'border-rose-300 bg-rose-50' : 'border-gray-200 bg-gray-50'}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${notificationSettings.notify_on_cancel ? 'bg-rose-500 text-white' : 'bg-gray-300 text-gray-600'}`}>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </div>
                            <div className="font-semibold text-gray-900">On Self Cancel</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => toggleNotificationSetting('notify_on_cancel', !notificationSettings.notify_on_cancel)}
                            disabled={busy.startsWith('notif-')}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${notificationSettings.notify_on_cancel ? 'bg-rose-500' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${notificationSettings.notify_on_cancel ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        <p className="text-sm text-gray-600 mb-3">Send WhatsApp confirmation to applicant when they cancel their own application.</p>
                        <button
                          type="button"
                          onClick={() => setEditingTemplate({ key: 'cancel_template', label: 'Cancellation Confirmation', value: notificationSettings.cancel_template })}
                          className="w-full text-sm text-rose-600 hover:text-rose-700 font-medium border border-rose-200 rounded-lg px-3 py-2 hover:bg-rose-50 transition-colors"
                        >
                          Edit Template
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-gray-500 bg-gray-100 rounded-lg p-3">
                      <strong>Note:</strong> WhatsApp notifications require the WhatsApp gateway to be configured and connected. Check <strong>Settings → WhatsApp Sender Number</strong> to verify the connection status.
                    </div>
                  </div>
                )}
              </SectionCard>
            )}

            {tab === 'submissions' && (
              <SectionCard title="Recent Submissions" subtitle="Attachments and approval history are layered on top of application submissions. This tab gives IQAC an operational view of what the configuration is driving.">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="py-2 pr-3">ID</th>
                        <th className="py-2 pr-3">Applicant</th>
                        <th className="py-2 pr-3">State</th>
                        <th className="py-2 pr-3">Current Step</th>
                        <th className="py-2 pr-3">Attachments</th>
                        <th className="py-2 pr-3">History</th>
                        <th className="py-2">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {submissions.map((row) => (
                        <tr key={row.id} className="border-b border-gray-50">
                          <td className="py-3 pr-3 font-medium text-gray-900">#{row.id}</td>
                          <td className="py-3 pr-3 text-gray-700">{row.applicant_username || '—'}</td>
                          <td className="py-3 pr-3 text-gray-700">{row.current_state}</td>
                          <td className="py-3 pr-3 text-gray-700">{row.current_step_role || '—'}</td>
                          <td className="py-3 pr-3 text-gray-700">{row.attachments_count}</td>
                          <td className="py-3 pr-3 text-gray-700">{row.history_count}</td>
                          <td className="py-3 text-gray-500">{new Date(row.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!submissions.length && <div className="text-sm text-gray-500 mt-3">No submissions found for the selected application type.</div>}
              </SectionCard>
            )}
          </div>
        </div>
      </div>

      {/* Group Creation Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Create Role Group</h3>
              <p className="text-sm text-gray-500 mt-1">Define a group name and select roles</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Group Name</label>
                <input
                  type="text"
                  value={groupDraft.name}
                  onChange={(e) => setGroupDraft((v) => ({ ...v, name: e.target.value }))}
                  placeholder="e.g., Finance Team"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Select Roles</label>
                <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                  {roles.length === 0 ? (
                    <div className="text-sm text-gray-500">No roles available</div>
                  ) : (
                    roles.map((role) => {
                      const checked = groupDraft.role_ids.includes(role.id)
                      return (
                        <label key={role.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) =>
                              setGroupDraft((v) => ({
                                ...v,
                                role_ids: e.target.checked
                                  ? [...v.role_ids, role.id]
                                  : v.role_ids.filter((id) => id !== role.id),
                              }))
                            }
                            className="w-4 h-4"
                          />
                          <span className="text-sm text-gray-700">{role.name}</span>
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
              {groupDraft.role_ids.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <div className="text-xs text-blue-700 font-semibold mb-1">Selected Roles:</div>
                  <div className="flex flex-wrap gap-1">
                    {groupDraft.role_ids.map((roleId) => {
                      const role = roles.find((r) => r.id === roleId)
                      return (
                        <span key={roleId} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">
                          {role?.name}
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (groupDraft.name.trim() && groupDraft.role_ids.length > 0) {
                    const newGroup = {
                      id: `group-${Date.now()}`,
                      name: groupDraft.name,
                      role_ids: groupDraft.role_ids,
                    }
                    setGroups((v) => [...v, newGroup])
                    setShowGroupModal(false)
                    setGroupDraft({ name: '', role_ids: [] })
                    setNotice(`Group "${newGroup.name}" created successfully`)
                    window.setTimeout(() => setNotice(null), 2500)
                  }
                }}
                disabled={!groupDraft.name.trim() || groupDraft.role_ids.length === 0}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-lg px-4 py-2 text-sm font-medium"
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Template Editing Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">Edit Message Template</h3>
              <p className="text-sm text-gray-500 mt-1">{editingTemplate.label}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="text-xs font-semibold text-blue-900 mb-1">Available Placeholders</div>
                <div className="flex flex-wrap gap-1 text-xs">
                  {['{applicant_name}', '{application_type}', '{application_id}', '{current_role}', '{next_role}', '{actor_name}', '{actor_role}', '{remarks}', '{link}', '{approver_name}'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setEditingTemplate((v) => v ? { ...v, value: v.value + ' ' + p } : v)}
                      className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono hover:bg-blue-200 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={editingTemplate.value}
                onChange={(e) => setEditingTemplate((v) => v ? { ...v, value: e.target.value } : v)}
                rows={8}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="Enter message template..."
              />
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-semibold text-gray-700 mb-2">Preview</div>
                <div className="text-sm text-gray-600 whitespace-pre-wrap">
                  {editingTemplate.value
                    .replace('{applicant_name}', 'John Doe')
                    .replace('{application_type}', selectedType?.name || 'Application')
                    .replace('{application_id}', '123')
                    .replace('{current_role}', 'HOD')
                    .replace('{next_role}', 'Principal')
                    .replace('{actor_name}', 'Jane Smith')
                    .replace('{actor_role}', 'HOD')
                    .replace('{remarks}', 'Approved for processing')
                    .replace('{link}', 'https://iqac.example.com/applications/123')
                    .replace('{approver_name}', 'Principal Admin')
                  }
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setEditingTemplate(null)}
                className="border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveNotificationTemplate(editingTemplate.key, editingTemplate.value)}
                disabled={busy === 'notif-template'}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg px-4 py-2 text-sm font-medium"
              >
                {busy === 'notif-template' ? 'Saving…' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}