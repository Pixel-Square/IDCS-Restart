import axios from 'axios'

const API = (path: string) => `${import.meta.env.VITE_API_BASE || 'http://localhost:8000'}/api/accounts/${path}`

export async function login(username: string, password: string){
  const res = await axios.post(API('token/'), { username, password })
  const { access, refresh } = res.data
  localStorage.setItem('access', access)
  localStorage.setItem('refresh', refresh)
  return res.data
}

export function logout(){
  localStorage.removeItem('access')
  localStorage.removeItem('refresh')
}

export async function getMe(){
  const token = localStorage.getItem('access')
  if(!token) throw new Error('no token')
  const res = await axios.get(API('me/'), { headers: { Authorization: `Bearer ${token}` } })
  return res.data
}
