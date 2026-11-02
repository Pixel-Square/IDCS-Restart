import React from 'react'
import { Outlet } from 'react-router-dom'
import DashboardSidebar from './DashboardSidebar'
import DashboardTopbar from './DashboardTopbar'
import { AuthUser } from '../../types/pbas'

interface Props {
  user: AuthUser | null
  onUserSwitch?: (user: AuthUser) => void
}

export default function DashboardLayout({ user, onUserSwitch }: Props) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <DashboardSidebar user={user} onUserSwitch={onUserSwitch} />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardTopbar user={user} />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
