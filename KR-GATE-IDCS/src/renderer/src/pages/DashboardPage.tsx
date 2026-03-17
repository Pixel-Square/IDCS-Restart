import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function DashboardPage(): JSX.Element {
  const nav = useNavigate()
  useEffect(() => {
    nav('/welcome', { replace: true })
  }, [nav])
  return <div />
}
