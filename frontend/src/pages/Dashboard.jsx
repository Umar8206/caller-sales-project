import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { RefreshCw, Phone, CalendarCheck, XCircle, TrendingUp, Clock, AlertCircle, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { leadsApi, queueApi } from '../api/client'
import StatusBadge from '../components/StatusBadge'

function Metric({ label, value, sub, icon: Icon, color = 'text-gray-900' }) {
  return (
    <div className="card px-5 py-4 flex items-start gap-4">
      {Icon && (
        <div className="mt-0.5 w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
          <Icon size={18} className="text-gray-500" />
        </div>
      )}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-semibold mt-0.5 leading-none ${color}`}>{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  )
}

function StatusRow({ label, count, color, pct }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600 w-36 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-800 w-8 text-right">{count}</span>
    </div>
  )
}

const STATUS_DISPLAY = [
  { key: 'appointment_set',  label: 'Appointment set',  color: 'bg-green-500' },
  { key: 'intake_completed', label: 'Intake completed', color: 'bg-purple-500' },
  { key: 'pending',          label: 'Pending',          color: 'bg-gray-400' },
  { key: 'no_answer',        label: 'No answer',        color: 'bg-gray-300' },
  { key: 'busy',             label: 'Busy',             color: 'bg-gray-300' },
  { key: 'declined',         label: 'Declined',         color: 'bg-red-500' },
  { key: 'failed',           label: 'Failed',           color: 'bg-orange-500' },
  { key: 'max_retries',      label: 'Max retries',      color: 'bg-red-400' },
  { key: 'dnc',              label: 'Do not call',      color: 'bg-pink-500' },
  { key: 'calling',          label: 'Calling now',      color: 'bg-amber-500' },
  { key: 'queued',           label: 'Queued',           color: 'bg-blue-500' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats,        setStats]        = useState(null)
  const [queue,        setQueue]        = useState(null)
  const [recentLeads,  setRecentLeads]  = useState([])
  const [loading,      setLoading]      = useState(true)

  const fetchAll = useCallback(async () => {
    try {
      const [s, q, recent] = await Promise.all([
        leadsApi.stats(),
        queueApi.stats(),
        leadsApi.list({ page: 1, limit: 8, sortBy: 'lastCalledAt', sortDir: 'desc' }),
      ])
      setStats(s)
      setQueue(q)
      setRecentLeads(recent.data?.filter(l => l.lastCalledAt) || [])
    } catch (e) { console.warn('[Dashboard] fetch failed:', e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 15_000)
    return () => clearInterval(iv)
  }, [fetchAll])

  const byStatus  = stats?.byStatus || {}
  const total     = stats?.total || 0
  const booked    = byStatus.appointment_set || 0
  const declined  = byStatus.declined || 0
  const called    = booked + declined
  const rate      = called > 0 ? ((booked / called) * 100).toFixed(1) : '0.0'
  const pending   = (byStatus.pending || 0) + (byStatus.no_answer || 0) + (byStatus.busy || 0) + (byStatus.failed || 0)
  const withForms = byStatus.intake_completed || 0

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">AI outbound calling overview</p>
        </div>
        <button className="btn" onClick={fetchAll}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Metric icon={Users}         label="Total leads"   value={total}                   sub="in database" />
        <Metric icon={Clock}         label="Today's calls" value={stats?.todayCalls}       sub="initiated today" />
        <Metric icon={AlertCircle}   label="Active now"    value={queue?.activeCalls || 0} color="text-amber-600" sub={`${queue?.waiting || 0} waiting`} />
        <Metric icon={CalendarCheck} label="Appointments"  value={booked}                  color="text-green-600" sub={`${rate}% booking rate`} />
        <Metric icon={XCircle}       label="Declined"      value={declined}                color="text-red-600" />
        <Metric icon={TrendingUp}    label="Pending"       value={pending}                 sub="ready to call" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Status breakdown */}
        <div className="card p-5">
          <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Status Breakdown</h2>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            STATUS_DISPLAY.filter(s => (byStatus[s.key] || 0) > 0).map(s => (
              <StatusRow
                key={s.key}
                label={s.label}
                count={byStatus[s.key] || 0}
                color={s.color}
                pct={total > 0 ? ((byStatus[s.key] || 0) / total) * 100 : 0}
              />
            ))
          )}
        </div>

        {/* Worker + quick stats */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Worker Status</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Status</span>
                <span className="flex items-center gap-1.5 text-sm text-green-600">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Running
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Active calls</span>
                <span className="text-sm font-semibold">{queue?.activeCalls ?? 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Waiting in queue</span>
                <span className="text-sm font-semibold">{queue?.waiting ?? 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Calls today</span>
                <span className="text-sm font-semibold">{stats?.todayCalls ?? 0}</span>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-4">Quick Links</h2>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/leads')}
                className="w-full text-left flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm text-gray-700 flex items-center gap-2">
                  <Phone size={15} className="text-gray-400" /> Manage leads
                </span>
                <span className="text-xs text-gray-400">→</span>
              </button>
              <button
                onClick={() => navigate('/forms')}
                className="w-full text-left flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm text-gray-700 flex items-center gap-2">
                  <CalendarCheck size={15} className="text-gray-400" /> View intake forms
                  {withForms > 0 && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">{withForms}</span>
                  )}
                </span>
                <span className="text-xs text-gray-400">→</span>
              </button>
              <button
                onClick={() => navigate('/leads?status=appointment_set')}
                className="w-full text-left flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <span className="text-sm text-gray-700 flex items-center gap-2">
                  <CalendarCheck size={15} className="text-gray-400" /> Appointments booked
                  {booked > 0 && (
                    <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">{booked}</span>
                  )}
                </span>
                <span className="text-xs text-gray-400">→</span>
              </button>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recent Activity</h2>
            <button onClick={() => navigate('/leads')} className="text-xs text-sky-600 hover:underline">
              View all →
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : recentLeads.length === 0 ? (
            <p className="text-sm text-gray-400">No calls made yet.</p>
          ) : (
            <div className="space-y-3">
              {recentLeads.map(lead => {
                const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'
                return (
                  <div
                    key={lead._id}
                    onClick={() => navigate(`/leads/${lead._id}`)}
                    className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-lg p-1.5 -mx-1.5 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                      <p className="text-xs text-gray-400">
                        {lead.lastCalledAt ? format(new Date(lead.lastCalledAt), 'MMM d, h:mm a') : ''}
                      </p>
                    </div>
                    <StatusBadge status={lead.status} />
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
