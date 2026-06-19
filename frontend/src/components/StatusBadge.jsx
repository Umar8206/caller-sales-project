const CONFIG = {
  pending:         { label: 'Pending',          classes: 'bg-gray-100 text-gray-600' },
  calling:         { label: 'Calling',          classes: 'bg-amber-100 text-amber-700' },
  queued:          { label: 'Queued',           classes: 'bg-blue-100 text-blue-700' },
  appointment_set: { label: 'Appointment set',  classes: 'bg-green-100 text-green-700' },
  declined:        { label: 'Declined',         classes: 'bg-red-100 text-red-600' },
  no_answer:       { label: 'No answer',        classes: 'bg-gray-100 text-gray-500' },
  busy:            { label: 'Busy',             classes: 'bg-gray-100 text-gray-500' },
  failed:          { label: 'Failed',           classes: 'bg-orange-100 text-orange-700' },
  max_retries:     { label: 'Max retries',      classes: 'bg-red-100 text-red-700' },
  dnc:             { label: 'Do not call',      classes: 'bg-pink-100 text-pink-700' },
}

export const STATUS_OPTIONS = Object.entries(CONFIG).map(([value, { label }]) => ({ value, label }))

export default function StatusBadge({ status, size = 'sm' }) {
  const cfg = CONFIG[status] || { label: status, classes: 'bg-gray-100 text-gray-600' }
  const sz  = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${sz} ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}
