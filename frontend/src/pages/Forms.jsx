import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { RefreshCw, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { leadsApi } from '../api/client'
import StatusBadge from '../components/StatusBadge'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const AREA_LABELS = {
  income_protection: 'Income Protection',
  final_expense:     'Final Expense',
  both:              'Both',
}

const FORM_STATUS_OPTIONS = [
  { value: 'intake_completed', label: 'Intake completed' },
  { value: 'appointment_set',  label: 'Appointment set' },
  { value: 'declined',         label: 'Declined' },
]

export default function Forms() {
  const navigate = useNavigate()
  const [leads,      setLeads]      = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [loading,    setLoading]    = useState(true)
  const [status,     setStatus]     = useState('intake_completed')
  const [page,       setPage]       = useState(1)

  const fetchForms = useCallback(async (pg = page) => {
    setLoading(true)
    try {
      const res = await leadsApi.list({ page: pg, limit: 25, status: status || undefined })
      setLeads(res.data)
      setPagination(res.pagination)
    } catch { toast.error('Failed to load forms') }
    finally { setLoading(false) }
  }, [page, status])

  useEffect(() => {
    setPage(1)
    fetchForms(1)
  }, [status])

  useEffect(() => {
    fetchForms(page)
  }, [page])

  const withForm = leads.filter(l => l.intakeForm)

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Intake Forms</h1>
          <p className="text-sm text-gray-500 mt-0.5">Leads with completed intake data</p>
        </div>
        <button className="btn" onClick={() => fetchForms(page)}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-gray-500 font-medium">Filter:</span>
        <button
          onClick={() => setStatus('')}
          className={`px-3 py-1 rounded-full text-xs border transition-colors ${
            status === ''
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
          }`}
        >
          All with forms
        </button>
        {FORM_STATUS_OPTIONS.map(o => (
          <button
            key={o.value}
            onClick={() => setStatus(status === o.value ? '' : o.value)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              status === o.value
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="card flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
      ) : withForm.length === 0 && !loading ? (
        <div className="card flex flex-col items-center justify-center h-48 gap-3 text-gray-400">
          <FileText size={32} className="text-gray-300" />
          <p className="text-sm">No intake forms found for this filter.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Phone</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Area of Interest</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Tobacco</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Health Event</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Referrals</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Completed</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {withForm.map((lead, i) => {
                  const form = lead.intakeForm
                  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'
                  return (
                    <tr
                      key={lead._id}
                      onClick={() => navigate(`/leads/${lead._id}`)}
                      className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                        i < withForm.length - 1 ? 'border-b border-gray-100' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium">{name}</td>
                      <td className="px-4 py-3 font-mono text-gray-600 text-xs">{lead.phone}</td>
                      <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                      <td className="px-4 py-3 text-gray-700">
                        {AREA_LABELS[form.areaOfInterest] ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {form.usesTobacco === true
                          ? <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Yes</span>
                          : form.usesTobacco === false
                          ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">No</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {form.hasMajorHealthEvent === true
                          ? <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Yes</span>
                          : form.hasMajorHealthEvent === false
                          ? <span className="text-xs text-gray-400">No</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {form.referrals?.length > 0
                          ? <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{form.referrals.length}</span>
                          : <span className="text-gray-400 text-xs">0</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {form.completedAt
                          ? format(new Date(form.completedAt), 'MMM d, h:mm a')
                          : form.isPartial
                          ? <span className="text-amber-600">Partial</span>
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs">View →</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
              <span className="text-xs text-gray-500">{pagination.total} results</span>
              <div className="flex items-center gap-2">
                <button
                  className="btn py-1 px-2"
                  onClick={() => setPage(p => p - 1)}
                  disabled={page <= 1}
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-xs text-gray-600">Page {page} of {pagination.pages}</span>
                <button
                  className="btn py-1 px-2"
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= pagination.pages}
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
