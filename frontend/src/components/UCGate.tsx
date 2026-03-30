import React from 'react'
import { useLocation } from 'react-router-dom'
import BuildingInfo from './BuildingInfo'
import { isPageUnderConstruction } from '../utils/underConstruction'

interface Props {
  user: any
  children: React.ReactNode
}

/**
 * Wraps ALL authenticated routes and shows BuildingInfo if the current
 * page is marked Under Construction for the logged-in user's roles.
 * UC state is seeded from the server via MeSerializer.under_construction on login.
 */
export default function UCGate({ user, children }: Props) {
  const location = useLocation()

  if (user) {
    const roles = (user.roles || []).map((r: string) => (r || '').toString().toUpperCase())
    const profile = (user.profile_type || '').toString().toUpperCase()
    const effectiveRoles = [...roles]
    if (profile) effectiveRoles.push(profile)

    if (isPageUnderConstruction(location.pathname, effectiveRoles)) {
      return <BuildingInfo />
    }
  }

  return <>{children}</>
}
