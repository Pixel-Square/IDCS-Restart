import React from 'react'
import { Navigate } from 'react-router-dom'

type User = any

interface Props {
  user: User | null
  element: React.ReactElement
  requiredRoles?: string[]
  requiredPermissions?: string[]
  requiredProfile?: 'STUDENT' | 'STAFF'
  requiredFeatures?: string[]
}

export default function ProtectedRoute({ user, element, requiredRoles, requiredPermissions, requiredProfile, requiredFeatures }: Props){
  // not authenticated -> redirect to login
  if(!user) return <Navigate to="/login" replace />

  const roles = (user.roles || []).map((r: string) => (r || '').toString().toUpperCase())
  const perms = (user.permissions || []).map((p: string) => (p || '').toString().toLowerCase())
  const features = (user.role_features || []).map((f: string) => (f || '').toString().toLowerCase())
  const profile = (user.profile_type || '').toString().toUpperCase()

  let allowed = false

  if(requiredProfile){
    if(requiredProfile === 'STUDENT' && profile === 'STUDENT') allowed = true
    if(requiredProfile === 'STAFF' && profile === 'STAFF') allowed = true
  }

  if(!allowed && requiredRoles && requiredRoles.length){
    const req = requiredRoles.map(r=> r.toString().toUpperCase())
    if(req.some(rr => roles.includes(rr))) allowed = true
  }

  if(!allowed && requiredPermissions && requiredPermissions.length){
    const req = requiredPermissions.map(p=> p.toString().toLowerCase())
    if(req.some(rp => perms.includes(rp))) allowed = true
  }

  if(!allowed && requiredFeatures && requiredFeatures.length){
    const req = requiredFeatures.map(f=> f.toString().toLowerCase())
    if(req.some(rf => features.includes(rf))) allowed = true
  }

  // If no requirements provided, allow by default
  if(!requiredProfile && (!requiredRoles || requiredRoles.length===0) && (!requiredPermissions || requiredPermissions.length===0) && (!requiredFeatures || requiredFeatures.length===0)){
    allowed = true
  }

  if(!allowed) return <Navigate to="/dashboard" replace />

  return element
}
