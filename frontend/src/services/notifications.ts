import { apiClient } from './auth'

export type NotificationTemplate = {
  code: string
  name: string
  template: string
  enabled: boolean
  expiry_minutes?: number | null
  updated_at?: string
}

export async function fetchNotificationTemplates(): Promise<NotificationTemplate[]> {
  const res = await apiClient.get('notification-templates/')
  return (res.data?.templates || []) as NotificationTemplate[]
}

export async function saveNotificationTemplates(templates: NotificationTemplate[]) {
  const res = await apiClient.put('notification-templates/', { templates })
  return res.data
}
