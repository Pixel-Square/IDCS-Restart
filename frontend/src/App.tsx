import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMe, logout } from './services/auth'

export default function App(){
  const [user, setUser] = useState<any>(null)
  const nav = useNavigate()

  useEffect(()=>{
    getMe().then(r=> setUser(r)).catch(()=>{})
  },[])

  return (
    <div style={{padding:20}}>
      <h1>College ERP - Demo</h1>
      {user ? (
        <div>
          <p>Welcome, {user.username} — role: {user.role?.name || 'none'}</p>
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
