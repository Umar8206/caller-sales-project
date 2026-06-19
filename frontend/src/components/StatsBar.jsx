import { Phone, TrendingUp, Clock, CalendarCheck, XCircle, AlertCircle } from 'lucide-react'

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

export default function StatsBar({ stats, queue }) {
  const byStatus = stats?.byStatus || {}
  const booked   = byStatus.appointment_set || 0
  const declined = byStatus.declined        || 0
  const called   = booked + declined
  const rate     = called > 0 ? ((booked / called) * 100).toFixed(1) : '0.0'
  const pending  = (byStatus.pending || 0) + (byStatus.no_answer || 0) + (byStatus.busy || 0) + (byStatus.failed || 0)

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      <Metric icon={Phone}        label="Total leads"   value={stats?.total}             sub="in database" />
      <Metric icon={Clock}        label="Today's calls" value={stats?.todayCalls}        sub="initiated today" />
      <Metric icon={AlertCircle}  label="Active now"    value={queue?.activeCalls || 0}  color="text-amber-600" sub={`${queue?.waiting || 0} waiting`} />
      <Metric icon={CalendarCheck} label="Appointments" value={booked}                   color="text-green-600" sub={`${rate}% booking rate`} />
      <Metric icon={XCircle}      label="Declined"      value={declined}                 color="text-red-600" />
      <Metric icon={TrendingUp}   label="Pending"       value={pending}                  sub="ready to call" />
    </div>
  )
}
