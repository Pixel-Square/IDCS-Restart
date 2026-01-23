import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../services/auth'

export default function Login(){
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string|null>(null)
  const nav = useNavigate()

  function extractServerMessage(err: unknown): string | null {
    if (typeof err !== 'object' || err === null) return null
    const e = err as Record<string, unknown>
    const response = e.response as Record<string, unknown> | undefined
    if (!response) return null
    const data = response.data as Record<string, unknown> | undefined
    if (!data) return null
    const nonField = data.non_field_errors as unknown
    if (Array.isArray(nonField) && nonField.length > 0) return String(nonField[0])
    if (typeof data.detail === 'string') return data.detail
    return null
  }

  const handle = async (e: React.FormEvent) =>{
    e.preventDefault()
    try{
      await login(identifier, password)
      nav('/')
    }catch(err){
      const serverMsg = extractServerMessage(err) || 'Login failed'
      setError(serverMsg)
    }
  }

  return (
    <div style={{padding:20}}>
      <h2>Login</h2>
      <form onSubmit={handle}>
        <div>
          <label>Identifier (email, reg_no or staff_id)</label>
          <input value={identifier} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setIdentifier(e.target.value)} />
        </div>
        <div>
          <label>Password</label>
          <input type="password" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} />
        </div>
        <button type="submit">Login</button>
        {error && <div style={{color:'red'}}>{error}</div>}
      </form>
    </div>
  )
}
