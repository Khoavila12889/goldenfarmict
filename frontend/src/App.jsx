import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import Tickets from './pages/Tickets'
import BookingPage from './pages/booking/BookingPage'
import Licenses from './pages/Licenses'
import Equipment from './pages/Equipment'
import Approvals from './pages/Approvals'
import WorkflowTemplates from './pages/WorkflowTemplates'
import SalarySlip from './pages/SalarySlip'
import SalarySlipAdmin from './pages/SalarySlipAdmin'
import Documents from './pages/Documents'
import Profile from './pages/Profile'
import Permissions from './pages/Permissions'
import Todos from './pages/Todos'
import Layout from './components/Layout'

function ProtectedRoute({ children }) {
  const token = sessionStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const role = sessionStorage.getItem('user_role')
  if (role !== 'admin' && role !== 'head') return <Navigate to="/" replace />
  return children
}

function LoginGuard() {
  const token = sessionStorage.getItem('token')
  return token ? <Navigate to="/" replace /> : <Login />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginGuard />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="todos" element={<Todos />} />
        <Route path="employees" element={<AdminRoute><Employees /></AdminRoute>} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="bookings" element={<BookingPage />} />
        <Route path="licenses" element={<Licenses />} />
        <Route path="equipment" element={<AdminRoute><Equipment /></AdminRoute>} />
        <Route path="approvals" element={<Approvals />} />
        <Route path="workflows" element={<AdminRoute><WorkflowTemplates /></AdminRoute>} />
        <Route path="salary-slip" element={<SalarySlip />} />
        <Route path="salary-slip-admin" element={<AdminRoute><SalarySlipAdmin /></AdminRoute>} />
        <Route path="documents" element={<Documents />} />
        <Route path="profile" element={<Profile />} />
        <Route path="permissions" element={<AdminRoute><Permissions /></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

