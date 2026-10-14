import { Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout.jsx'
import GuestRoute from './components/GuestRoute.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import JobDetailsPage from './pages/JobDetailsPage.jsx'
import JobsPage from './pages/JobsPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import NewJobPage from './pages/NewJobPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <GuestRoute>
            <LoginPage />
          </GuestRoute>
        }
      />
      <Route
        path="/register"
        element={
          <GuestRoute>
            <RegisterPage />
          </GuestRoute>
        }
      />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/jobs" element={<JobsPage />} />
        <Route path="/jobs/new" element={<NewJobPage />} />
        <Route path="/jobs/:jobId" element={<JobDetailsPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/jobs" replace />} />
      <Route path="*" element={<Navigate to="/jobs" replace />} />
    </Routes>
  )
}
