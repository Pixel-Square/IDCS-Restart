"""Spring Boot project templates."""

_SPRING_BOOT_POM = '''\
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
    <relativePath/>
  </parent>
  <groupId>com.example</groupId>
  <artifactId>demo</artifactId>
  <version>0.0.1-SNAPSHOT</version>
  <name>demo</name>
  <description>Demo project for Spring Boot</description>
  <properties>
    <java.version>21</java.version>
  </properties>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>
  </dependencies>
  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
        <configuration>
          <mainClass>com.example.demo.Application</mainClass>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
'''

_SPRING_APP_JAVA = '''\
package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
'''

_SPRING_APP_PROPERTIES = '''\
server.port=8080
spring.application.name=demo
'''

_SPRING_HELLO_CONTROLLER = '''\
package com.example.demo.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HelloController {

    @GetMapping("/")
    public String hello() {
        return "Hello from Spring Boot!";
    }

    @GetMapping("/api/status")
    public java.util.Map<String, Object> status() {
        return java.util.Map.of("status", "running", "service", "demo");
    }
}
'''

_SPRING_APP_TEST = '''\
package com.example.demo;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class ApplicationTests {
    @Test
    void contextLoads() {}
}
'''

# ── Student Portal template ──────────────────────────────────────────────────

_PORTAL_POM = _SPRING_BOOT_POM.replace(
    '<artifactId>demo</artifactId>',
    '<artifactId>student-portal</artifactId>',
).replace(
    '<name>demo</name>',
    '<name>student-portal</name>',
).replace(
    'spring-boot-starter-web</artifactId>',
    'spring-boot-starter-web</artifactId>\n    </dependency>\n    <dependency>\n      <groupId>org.springframework.boot</groupId>\n      <artifactId>spring-boot-starter-data-jpa',
).replace(
    'com.example</groupId>',
    'com.idcs</groupId>',
).replace(
    '<mainClass>com.example.demo.Application</mainClass>',
    '<mainClass>com.idcs.studentportal.Application</mainClass>',
)

_PORTAL_APP = '''\
package com.idcs.studentportal;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
'''

_PORTAL_USER = '''\
package com.idcs.studentportal.model;

import jakarta.persistence.*;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String username;

    @Column(nullable = false)
    private String password;

    private String email;
    private String role;

    // Getters and setters
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
}
'''

_PORTAL_USER_REPO = '''\
package com.idcs.studentportal.repository;

import com.idcs.studentportal.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
}
'''

_PORTAL_AUTH_SERVICE = '''\
package com.idcs.studentportal.service;

import com.idcs.studentportal.model.User;
import com.idcs.studentportal.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.Optional;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    public User register(String username, String password, String email) {
        User user = new User();
        user.setUsername(username);
        user.setPassword(password); // TODO: encode password
        user.setEmail(email);
        user.setRole("STUDENT");
        return userRepository.save(user);
    }

    public Optional<User> login(String username, String password) {
        return userRepository.findByUsername(username)
            .filter(u -> u.getPassword().equals(password));
    }
}
'''

_PORTAL_AUTH_CONTROLLER = '''\
package com.idcs.studentportal.controller;

import com.idcs.studentportal.model.User;
import com.idcs.studentportal.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin
public class AuthController {

    @Autowired
    private AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> body) {
        try {
            User user = authService.register(
                body.get("username"),
                body.get("password"),
                body.get("email")
            );
            return ResponseEntity.ok(Map.of("id", user.getId(), "username", user.getUsername()));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> body) {
        return authService.login(body.get("username"), body.get("password"))
            .map(u -> ResponseEntity.ok(Map.of("id", u.getId(), "username", u.getUsername(), "role", u.getRole())))
            .orElse(ResponseEntity.status(401).body(Map.of("error", "Invalid credentials")));
    }
}
'''

_PORTAL_PROPERTIES = '''\
server.port=8080
spring.application.name=student-portal
# H2 in-memory database for development
spring.datasource.url=jdbc:h2:mem:testdb
spring.datasource.driver-class-name=org.h2.Driver
spring.jpa.database-platform=org.hibernate.dialect.H2Dialect
spring.jpa.hibernate.ddl-auto=create-drop
spring.h2.console.enabled=true
'''

_PORTAL_README = '''\
# Student Portal — Spring Boot

## Running
```
./mvnw clean spring-boot:run
```

## Endpoints
- `POST /api/auth/register` — register user
- `POST /api/auth/login` — login

## H2 Console
http://localhost:8080/h2-console
'''

SPRING_BOOT_TEMPLATES = [
    {
        'id': 'spring-boot-basic',
        'label': 'Basic Spring Boot',
        'description': 'Minimal Spring Boot REST project with a Hello World controller',
        'project_type': 'SPRING_BOOT',
        'framework': 'Spring Boot',
        'project_defaults': {
            'project_type': 'SPRING_BOOT',
            'runtime': 'JAVA',
            'runtime_version': '21',
            'build_tool': 'MAVEN',
            'build_command': 'mvn clean package -DskipTests',
            'start_command': 'java -jar target/*.jar',
            'run_command': '',
            'app_port': 8080,
            'preview_enabled': True,
            'workspace_type': 'PROJECT',
        },
        'tree': {
            'folders': [
                {'path': 'src/main/java/com/example/demo/controller'},
                {'path': 'src/main/resources'},
                {'path': 'src/test/java/com/example/demo'},
            ],
            'files': [
                {'path': 'pom.xml', 'content': _SPRING_BOOT_POM},
                {'path': 'src/main/java/com/example/demo/Application.java', 'content': _SPRING_APP_JAVA},
                {'path': 'src/main/java/com/example/demo/controller/HelloController.java', 'content': _SPRING_HELLO_CONTROLLER},
                {'path': 'src/main/resources/application.properties', 'content': _SPRING_APP_PROPERTIES},
                {'path': 'src/test/java/com/example/demo/ApplicationTests.java', 'content': _SPRING_APP_TEST},
            ],
        },
    },
    {
        'id': 'spring-boot-portal',
        'label': 'Student Portal',
        'description': 'Spring Boot project with User, AuthController, AuthService, UserRepository (JPA + H2)',
        'project_type': 'SPRING_BOOT',
        'framework': 'Spring Boot',
        'project_defaults': {
            'project_type': 'SPRING_BOOT',
            'runtime': 'JAVA',
            'runtime_version': '21',
            'build_tool': 'MAVEN',
            'build_command': 'mvn clean package -DskipTests',
            'start_command': 'java -jar target/*.jar',
            'run_command': '',
            'app_port': 8080,
            'preview_enabled': True,
            'workspace_type': 'PROJECT',
        },
        'tree': {
            'folders': [
                {'path': 'src/main/java/com/idcs/studentportal/controller'},
                {'path': 'src/main/java/com/idcs/studentportal/service'},
                {'path': 'src/main/java/com/idcs/studentportal/model'},
                {'path': 'src/main/java/com/idcs/studentportal/repository'},
                {'path': 'src/main/resources'},
                {'path': 'src/test/java/com/idcs/studentportal'},
            ],
            'files': [
                {'path': 'pom.xml', 'content': _PORTAL_POM},
                {'path': 'README.md', 'content': _PORTAL_README},
                {'path': 'src/main/java/com/idcs/studentportal/Application.java', 'content': _PORTAL_APP},
                {'path': 'src/main/java/com/idcs/studentportal/model/User.java', 'content': _PORTAL_USER},
                {'path': 'src/main/java/com/idcs/studentportal/repository/UserRepository.java', 'content': _PORTAL_USER_REPO},
                {'path': 'src/main/java/com/idcs/studentportal/service/AuthService.java', 'content': _PORTAL_AUTH_SERVICE},
                {'path': 'src/main/java/com/idcs/studentportal/controller/AuthController.java', 'content': _PORTAL_AUTH_CONTROLLER},
                {'path': 'src/main/resources/application.properties', 'content': _PORTAL_PROPERTIES},
            ],
        },
    },
]
