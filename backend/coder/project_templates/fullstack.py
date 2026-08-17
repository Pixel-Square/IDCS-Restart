"""Full Stack (Spring Boot + React) project templates."""

_BACKEND_POM = '''\
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
             https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
  </parent>
  <groupId>com.idcs</groupId>
  <artifactId>fullstack-backend</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <properties><java.version>21</java.version></properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
        <configuration>
          <mainClass>com.idcs.backend.Application</mainClass>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
'''

_BACKEND_APP = '''\
package com.idcs.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
'''

_BACKEND_CONTROLLER = '''\
package com.idcs.backend.controller;

import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ApiController {

    @GetMapping("/health")
    public Map<String, String> health() {
        return Map.of("status", "ok", "service", "fullstack-backend");
    }
}
'''

_BACKEND_PROPERTIES = '''\
server.port=8080
spring.application.name=fullstack-backend
'''

_FRONTEND_PACKAGE = '''\
{
  "name": "frontend",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.18.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.37",
    "@types/react-dom": "^18.2.15",
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}
'''

_FRONTEND_INDEX = '''\
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Student Portal</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
'''

_FRONTEND_MAIN = '''\
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
'''

_FRONTEND_APP = '''\
import { useState } from 'react'

const API = 'http://localhost:8080/api'

function App() {
  const [status, setStatus] = useState(null)

  const checkHealth = async () => {
    const res = await fetch(`${API}/health`)
    const data = await res.json()
    setStatus(data.status)
  }

  return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <h1>Student Portal</h1>
      <button onClick={checkHealth}>Check Backend</button>
      {status && <p>Backend: {status}</p>}
    </div>
  )
}

export default App
'''

_VITE_CONFIG = '''\
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8080'
    }
  }
})
'''

_FULLSTACK_README = '''\
# Full Stack — Spring Boot + React

## Structure
```
backend/   Spring Boot REST API (port 8080)
frontend/  React + Vite frontend (port 3000)
```

## Running Backend
```bash
cd backend
./mvnw spring-boot:run
```

## Running Frontend
```bash
cd frontend
npm install && npm run dev
```
'''

FULLSTACK_TEMPLATES = [
    {
        'id': 'fullstack-spring-react',
        'label': 'Spring Boot + React',
        'description': 'Full stack project: Spring Boot backend (port 8080) + React/Vite frontend (port 3000)',
        'project_type': 'FULL_STACK',
        'framework': 'Spring Boot + React',
        'project_defaults': {
            'project_type': 'FULL_STACK',
            'runtime': 'JAVA',
            'runtime_version': '21',
            'build_tool': 'MAVEN',
            'build_command': 'cd backend && mvn clean package -DskipTests && cd ../frontend && npm install && npm run build',
            'start_command': 'cd backend && java -jar target/*.jar',
            'run_command': '',
            'app_port': 8080,
            'preview_enabled': True,
            'workspace_type': 'PROJECT',
        },
        'tree': {
            'folders': [
                {'path': 'backend/src/main/java/com/idcs/backend/controller'},
                {'path': 'backend/src/main/resources'},
                {'path': 'frontend/src/pages'},
                {'path': 'frontend/src/components'},
            ],
            'files': [
                {'path': 'README.md', 'content': _FULLSTACK_README},
                # Backend
                {'path': 'backend/pom.xml', 'content': _BACKEND_POM},
                {'path': 'backend/src/main/java/com/idcs/backend/Application.java', 'content': _BACKEND_APP},
                {'path': 'backend/src/main/java/com/idcs/backend/controller/ApiController.java', 'content': _BACKEND_CONTROLLER},
                {'path': 'backend/src/main/resources/application.properties', 'content': _BACKEND_PROPERTIES},
                # Frontend
                {'path': 'frontend/package.json', 'content': _FRONTEND_PACKAGE},
                {'path': 'frontend/index.html', 'content': _FRONTEND_INDEX},
                {'path': 'frontend/vite.config.js', 'content': _VITE_CONFIG},
                {'path': 'frontend/src/main.jsx', 'content': _FRONTEND_MAIN},
                {'path': 'frontend/src/App.jsx', 'content': _FRONTEND_APP},
            ],
        },
    },
]
