"""Frontend (React/Node) project templates."""

_REACT_PACKAGE = '''\
{
  "name": "react-app",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
'''

_REACT_INDEX = '''\
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
'''

_REACT_MAIN = '''\
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
'''

_REACT_APP = '''\
import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif', textAlign: 'center' }}>
      <h1>Hello from React!</h1>
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c + 1)}>Increment</button>
    </div>
  )
}

export default App
'''

_REACT_CSS = '''\
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: sans-serif; background: #f9f9f9; }
button { padding: 8px 16px; cursor: pointer; }
'''

_VITE_CONFIG = '''\
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, host: true },
})
'''

FRONTEND_TEMPLATES = [
    {
        'id': 'frontend-react-vite',
        'label': 'React + Vite',
        'description': 'Minimal React application with Vite',
        'project_type': 'FRONTEND',
        'framework': 'React',
        'project_defaults': {
            'project_type': 'FRONTEND',
            'runtime': 'NODE',
            'runtime_version': '20',
            'build_tool': 'NPM',
            'build_command': 'npm install',
            'start_command': 'npm run dev',
            'run_command': '',
            'app_port': 3000,
            'preview_enabled': True,
            'workspace_type': 'PROJECT',
        },
        'tree': {
            'folders': [
                {'path': 'src'},
            ],
            'files': [
                {'path': 'package.json', 'content': _REACT_PACKAGE},
                {'path': 'index.html', 'content': _REACT_INDEX},
                {'path': 'vite.config.js', 'content': _VITE_CONFIG},
                {'path': 'src/main.jsx', 'content': _REACT_MAIN},
                {'path': 'src/App.jsx', 'content': _REACT_APP},
                {'path': 'src/index.css', 'content': _REACT_CSS},
            ],
        },
    },
]
