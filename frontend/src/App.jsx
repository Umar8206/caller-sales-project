import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Leads from './pages/Leads'
import LeadDetail from './pages/LeadDetail'
import Forms from './pages/Forms'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/"           element={<Dashboard />} />
        <Route path="/leads"      element={<Leads />} />
        <Route path="/leads/:id"  element={<LeadDetail />} />
        <Route path="/forms"      element={<Forms />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
