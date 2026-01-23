import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMe, logout } from './services/auth'

type RoleObj = { name: string }
type Me = {
  id: number
  username: string
  email?: string
  roles?: string[] | RoleObj[]
  permissions?: string[]
}

export default function App(){
  const [user, setUser] = useState<Me | null>(null)
  const nav = useNavigate()

  useEffect(()=>{
    getMe().then(r=> setUser(r)).catch(()=>{})
  },[])

  return (
    <div style={{padding:20}}>
      <h1>College ERP - Demo</h1>
      {user ? (
        <div>
          <p>Welcome, {user.username} — roles: {Array.isArray(user.roles) ? (user.roles as string[]).join(', ') : (Array.isArray(user.roles) ? (user.roles as RoleObj[]).map(r=>r.name).join(', ') : 'none')}</p>
          <p>Permissions: {Array.isArray(user.permissions) ? user.permissions.join(', ') : ''}</p>
          <button onClick={() => { logout(); nav('/login') }}>Logout</button>
        </div>
      ) : (
        <div>
          <p>You are not logged in.</p>
          <Link to="/login">Login</Link>
        </div>
      )}
    </div>
  )
}
