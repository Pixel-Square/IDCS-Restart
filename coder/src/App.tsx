import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth, useRole } from './AuthContext'

// Pages
import LoginPage from './pages/auth/LoginPage'
import Layout from './components/Layout'

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminCoursesPage from './pages/admin/AdminCoursesPage'
import AdminCourseDetail from './pages/admin/AdminCourseDetail'
import AdminClassesPage from './pages/admin/AdminClassesPage'
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage'

// Incharge pages
import InchargeDashboard from './pages/incharge/InchargeDashboard'
import InchargeCoursePage from './pages/incharge/InchargeCoursePage'
import InchargeSessionPage from './pages/incharge/InchargeSessionPage'
import InchargeAssessmentPage from './pages/incharge/InchargeAssessmentPage'
import InchargeSubmissionsPage from './pages/incharge/InchargeSubmissionsPage'

// Student pages
import StudentDashboard from './pages/student/StudentDashboard'
import StudentCoursePage from './pages/student/StudentCoursePage'
import StudentSessionPage from './pages/student/StudentSessionPage'
import StudentAssessmentPage from './pages/student/StudentAssessmentPage'
import StudentIDE from './pages/student/StudentIDE'

// Section incharge pages
import SectionDashboard from './pages/section/SectionDashboard'
import SectionStudentsPage from './pages/section/SectionStudentsPage'
import SectionStudentDetail from './pages/section/SectionStudentDetail'
import SectionAnalyticsPage from './pages/section/SectionAnalyticsPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RootRedirect() {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}><div className="spinner" /></div>
  if (!user) return <Navigate to="/login" replace />
  switch (user.coder_role) {
    case 'CODE_ADMIN': return <Navigate to="/admin" replace />
    case 'CODE_COURSE_INCHARGE': return <Navigate to="/incharge" replace />
    case 'CODE_SECTION_INCHARGE': return <Navigate to="/section" replace />
    default: return <Navigate to="/student" replace />
  }
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><RootRedirect /></RequireAuth>} />

      {/* Admin */}
      <Route path="/admin" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<AdminDashboard />} />
        <Route path="courses" element={<AdminCoursesPage />} />
        <Route path="courses/:id" element={<AdminCourseDetail />} />
        <Route path="classes" element={<AdminClassesPage />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
      </Route>

      {/* Incharge */}
      <Route path="/incharge" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<InchargeDashboard />} />
        <Route path="courses/:id" element={<InchargeCoursePage />} />
        <Route path="sessions/:id" element={<InchargeSessionPage />} />
        <Route path="assessments/:id" element={<InchargeAssessmentPage />} />
        <Route path="submissions/:assessmentId" element={<InchargeSubmissionsPage />} />
      </Route>

      {/* Student */}
      <Route path="/student" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<StudentDashboard />} />
        <Route path="courses/:id" element={<StudentCoursePage />} />
        <Route path="sessions/:id" element={<StudentSessionPage />} />
        <Route path="assessments/:id" element={<StudentAssessmentPage />} />
      </Route>
      {/* IDE in full screen */}
      <Route path="/student/ide/:assessmentId" element={<RequireAuth><StudentIDE /></RequireAuth>} />

      {/* Section Incharge */}
      <Route path="/section" element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<SectionDashboard />} />
        <Route path="classes/:classId/students" element={<SectionStudentsPage />} />
        <Route path="classes/:classId/students/:studentId" element={<SectionStudentDetail />} />
        <Route path="classes/:classId/analytics" element={<SectionAnalyticsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
