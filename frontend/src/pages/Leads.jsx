import { useState, useEffect, useCallback } from 'react'
import { Plus, Upload, Play, Pause, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { leadsApi, queueApi } from '../api/client'
import LeadsTable from '../components/LeadsTable'
import AddLeadModal from '../components/AddLeadModal'
import UploadModal from '../components/UploadModal'
import StatusBadge, { STATUS_OPTIONS } from '../components/StatusBadge'

export default function Leads() {
  const [leads,      setLeads]      = useState([])
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 })
  const [stats,      setStats]      = useState(null)
  const [queue,      setQueue]      = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [paused,     setPaused]     = useState(false)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [page,   setPage]   = useState(1)

  const [showAdd,    setShowAdd]    = useState(false)
  const [showUpload, setShowUpload] = useState(false)

  const fetchLeads = useCallback(async (pg = page) => {
    setLoading(true)
    try {
      const res = await leadsApi.list({ page: pg, limit: 25, status, search: search || undefined })
      setLeads(res.data)
      setPagination(res.pagination)
    } catch { toast.error('Failed to load leads') }
    finally { setLoading(false) }
  }, [page, status, search])

  const fetchStats = useCallback(async () => {
    try {
      const [s, q] = await Promise.all([leadsApi.stats(), queueApi.stats()])
      setStats(s)
      setQueue(q)
    } catch (e) { console.warn('[Leads] Stats fetch failed:', e.message) }
  }, [])

  useEffect(() => {
    fetchLeads(1)
    fetchStats()
    const iv = setInterval(fetchStats, 10_000)
    return () => clearInterval(iv)
  }, [fetchLeads, fetchStats])

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    fetchLeads(1)
  }

  const handleStatusFilter = (val) => {
    setStatus(val)
    setPage(1)
  }

  const handleStartCalling = async () => {
    try {
      const res = await leadsApi.startCalling()
      toast.success(res.message)
      fetchStats()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed')
    }
  }

  const togglePause = async () => {
    try {
      if (paused) { await queueApi.resume(); setPaused(false); toast.success('Worker resumed') }
      else        { await queueApi.pause();  setPaused(true);  toast.success('Worker paused') }
    } catch { toast.error('Failed to toggle worker') }
  }

  const byStatus = stats?.byStatus || {}
  const pendingCount = (byStatus.pending || 0) + (byStatus.no_answer || 0) + (byStatus.busy || 0) + (byStatus.failed || 0)

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">{pagination.total} leads total</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setShowUpload(true)}>
            <Upload size={15} /> Upload leads
          </button>
          <button className="btn" onClick={() => setShowAdd(true)}>
            <Plus size={15} /> Add lead
          </button>
          <button className="btn" onClick={togglePause}>
            {paused ? <><Play size={15} /> Resume worker</> : <><Pause size={15} /> Pause worker</>}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleStartCalling}
            disabled={pendingCount === 0}
          >
            <Play size={15} />
            Start calling ({pendingCount})
          </button>
        </div>
      </div>

      {/* Worker status bar */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span className="text-gray-500 font-medium">Worker</span>
        <span className={`flex items-center gap-1.5 ${paused ? 'text-amber-600' : 'text-green-600'}`}>
          <span className={`w-2 h-2 rounded-full ${paused ? 'bg-amber-500' : 'bg-green-500'}`} />
          {paused ? 'Paused' : 'Running'}
        </span>
        <span className="text-gray-400">·</span>
        <span className="text-gray-600"><strong className="text-gray-900">{queue?.activeCalls ?? 0}</strong> active calls</span>
        <span className="text-gray-400">·</span>
        <span className="text-gray-600"><strong className="text-gray-900">{queue?.waiting ?? 0}</strong> waiting</span>
        <span className="text-gray-400">·</span>
        <span className="text-gray-600"><strong className="text-gray-900">{stats?.todayCalls ?? 0}</strong> calls today</span>
        <button className="ml-auto text-gray-400 hover:text-gray-600" onClick={fetchStats}>
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-48">
          <input
            className="input flex-1"
            placeholder="Search name, phone, company…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button type="submit" className="btn">Search</button>
          {search && (
            <button type="button" className="btn" onClick={() => { setSearch(''); setPage(1); fetchLeads(1) }}>
              Clear
            </button>
          )}
        </form>
        <select
          className="input w-44"
          value={status}
          onChange={e => handleStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Status filter pills */}
      {stats && (
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.filter(o => (byStatus[o.value] || 0) > 0).map(o => (
            <button
              key={o.value}
              onClick={() => handleStatusFilter(status === o.value ? '' : o.value)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-colors ${
                status === o.value
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {o.label}
              <span className={`font-semibold ${status === o.value ? 'text-white' : 'text-gray-900'}`}>
                {byStatus[o.value] || 0}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <LeadsTable
        leads={leads}
        pagination={pagination}
        loading={loading}
        onPageChange={(pg) => { setPage(pg); fetchLeads(pg) }}
      />

      {showAdd    && <AddLeadModal    onClose={() => setShowAdd(false)}    onSuccess={() => { fetchLeads(1); fetchStats() }} />}
      {showUpload && <UploadModal     onClose={() => setShowUpload(false)} onSuccess={() => { fetchLeads(1); fetchStats() }} />}
    </div>
  )
}
