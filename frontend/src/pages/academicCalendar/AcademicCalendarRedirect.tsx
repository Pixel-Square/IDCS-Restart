import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

type Me = {
  roles?: string[]
  profile_type?: string | null
}

export default function AcademicCalendarRedirect(props: { user: Me | null }) {
  const nav = useNavigate()

  useEffect(() => {
    const rolesUpper = (props.user?.roles || []).map(r => String(r || '').toUpperCase())

    if (rolesUpper.includes('IQAC')) {
      nav('/iqac/calendar', { replace: true })
      return
    }
    if (rolesUpper.includes('HOD')) {
      nav('/hod/calendar', { replace: true })
      return
    }
    if ((props.user?.profile_type || '').toUpperCase() === 'STUDENT') {
      nav('/student/calendar', { replace: true })
      return
    }

    nav('/dashboard', { replace: true })
  }, [nav, props.user])

  return (
    <div className="p-6">
      <div className="text-gray-600">Redirecting…</div>
    </div>
  )
}
