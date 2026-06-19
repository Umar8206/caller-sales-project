import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Phone, Mail, Building2, RefreshCw, Ban, CalendarCheck } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { leadsApi } from '../api/client'
import StatusBadge from '../components/StatusBadge'

function InfoRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-right max-w-xs truncate">{value}</span>
    </div>
  )
}

export default function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [lead,    setLead]    = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const data = await leadsApi.get(id)
      setLead(data)
    } catch { toast.error('Failed to load lead') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [id])

  const updateStatus = async (status) => {
    try {
      await leadsApi.update(id, { status })
      toast.success(`Status updated to ${status}`)
      load()
    } catch { toast.error('Failed to update') }
  }

  const retry = async () => {
    try {
      await leadsApi.retry(id)
      toast.success('Lead reset — worker will call on next poll')
      load()
    } catch (e) { toast.error(e.response?.data?.error || 'Failed') }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading…</div>
  )
  if (!lead) return (
    <div className="p-6 text-gray-500">Lead not found.</div>
  )

  const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ') || 'Unknown'
  const canRetry = !['appointment_set','declined','dnc','calling'].includes(lead.status)
  const sessions = lead.callSessions || []

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Back + header */}
      <div>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
          <ArrowLeft size={15} /> Back to dashboard
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={lead.status} size="lg" />
              <span className="text-sm text-gray-400">
                {lead.retryCount}/{lead.maxRetries} attempts
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {lead.status !== 'appointment_set' && <button className="btn text-xs" onClick={() => updateStatus('appointment_set')}><CalendarCheck size={13} /> Mark booked</button>}
            {lead.status !== 'declined'        && <button className="btn text-xs" onClick={() => updateStatus('declined')}>Mark declined</button>}
            {lead.status !== 'dnc'             && <button className="btn text-xs" onClick={() => updateStatus('dnc')}><Ban size={13} /> Add to DNC</button>}
            {canRetry                           && <button className="btn btn-primary text-xs" onClick={retry}><RefreshCw size={13} /> Retry now</button>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left: contact info */}
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Contact</h2>
            <div className="space-y-2">
              {lead.phone   && <div className="flex items-center gap-2 text-sm"><Phone    size={14} className="text-gray-400" /><span className="font-mono">{lead.phone}</span></div>}
              {lead.email   && <div className="flex items-center gap-2 text-sm"><Mail     size={14} className="text-gray-400" /><span>{lead.email}</span></div>}
              {lead.company && <div className="flex items-center gap-2 text-sm"><Building2 size={14} className="text-gray-400" /><span>{lead.company}</span></div>}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Details</h2>
            <InfoRow label="Source"       value={(lead.source || 'manual').replace('_', ' ')} />
            <InfoRow label="Created"      value={lead.createdAt ? format(new Date(lead.createdAt), 'MMM d, yyyy') : null} />
            <InfoRow label="Last called"  value={lead.lastCalledAt ? format(new Date(lead.lastCalledAt), 'MMM d, h:mm a') : null} />
            <InfoRow label="Next retry"   value={lead.nextRetryAt  ? format(new Date(lead.nextRetryAt),  'MMM d, h:mm a') : null} />
            {lead.appointmentNotes && <InfoRow label="Appt. hint" value={lead.appointmentNotes} />}
            {lead.uploadBatchId && <InfoRow label="Batch" value={lead.uploadBatchId.slice(0, 8) + '…'} />}
          </div>
        </div>

        {/* Right: transcript + sessions */}
        <div className="lg:col-span-2 space-y-4">

          {/* Best transcript */}
          {lead.finalTranscript && (
            <div className="card p-5">
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Call transcript</h2>
              {lead.finalAudioUrl && (
                <div className="mb-3">
                  <audio controls src={lead.finalAudioUrl} className="w-full h-9" />
                </div>
              )}
              <div className="bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto space-y-1">
                {lead.finalTranscript.split('\n').map((line, i) => {
                  const isAgent = line.startsWith('[AGENT]')
                  return (
                    <p key={i} className={`text-sm leading-relaxed ${isAgent ? 'text-sky-700' : 'text-gray-700'}`}>
                      {line}
                    </p>
                  )
                })}
              </div>
            </div>
          )}

          {/* Call history */}
          <div className="card p-5">
            <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Call history ({sessions.length})
            </h2>
            {sessions.length === 0 ? (
              <p className="text-sm text-gray-400">No calls made yet.</p>
            ) : (
              <div className="space-y-3">
                {sessions.map((s, i) => (
                  <div key={s._id || i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <StatusBadge status={s.status} />
                        {s.durationSeconds > 0 && (
                          <span className="text-xs text-gray-500">{s.durationSeconds}s</span>
                        )}
                        {s.detectedOutcome !== 'unknown' && (
                          <span className="text-xs font-medium text-gray-600 capitalize">{s.detectedOutcome.replace('_', ' ')}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {s.initiatedAt ? format(new Date(s.initiatedAt), 'MMM d, yyyy h:mm a') : ''}
                      </p>
                      {s.outcomeSummary && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.outcomeSummary}</p>
                      )}
                    </div>
                    {s.recordingUrl && (
                      <audio controls src={s.recordingUrl} className="h-8 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
