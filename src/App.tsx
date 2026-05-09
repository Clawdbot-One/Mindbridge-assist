import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import Dashboard from '@/pages/Dashboard'
import AssessmentList from '@/pages/AssessmentList'
import AssessmentSession from '@/pages/AssessmentSession'
import AssessmentResult from '@/pages/AssessmentResult'
import Behavior from '@/pages/Behavior'
import BehaviorRecord from '@/pages/BehaviorRecord'
import Emotion from '@/pages/Emotion'
import EmotionRecord from '@/pages/EmotionRecord'
import AAC from '@/pages/AAC'
import Reports from '@/pages/Reports'
import ReportDetail from '@/pages/ReportDetail'
import Collaboration from '@/pages/Collaboration'
import Profile from '@/pages/Profile'
import { useAuthStore } from '@/stores/authStore'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" />
  return <Layout>{children}</Layout>
}

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const loadUser = useAuthStore(s => s.loadUser)
  const token = useAuthStore(s => s.token)
  const user = useAuthStore(s => s.user)
  const isLoading = useAuthStore(s => s.isLoading)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (token) {
      loadUser().finally(() => setInitialized(true))
    } else {
      setInitialized(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (token && !user && isLoading && !initialized) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-sky-500 border-t-transparent" />
      </div>
    )
  }

  return <>{children}</>
}

export default function App() {
  return (
    <Router>
      <AuthInitializer>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/assessment" element={<ProtectedRoute><AssessmentList /></ProtectedRoute>} />
          <Route path="/assessment/:id" element={<ProtectedRoute><AssessmentSession /></ProtectedRoute>} />
          <Route path="/assessment/:id/result" element={<ProtectedRoute><AssessmentResult /></ProtectedRoute>} />
          <Route path="/behavior" element={<ProtectedRoute><Behavior /></ProtectedRoute>} />
          <Route path="/behavior/record" element={<ProtectedRoute><BehaviorRecord /></ProtectedRoute>} />
          <Route path="/emotion" element={<ProtectedRoute><Emotion /></ProtectedRoute>} />
          <Route path="/emotion/record" element={<ProtectedRoute><EmotionRecord /></ProtectedRoute>} />
          <Route path="/aac" element={<ProtectedRoute><AAC /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/reports/:id" element={<ProtectedRoute><ReportDetail /></ProtectedRoute>} />
          <Route path="/collaboration" element={<ProtectedRoute><Collaboration /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </AuthInitializer>
    </Router>
  )
}
