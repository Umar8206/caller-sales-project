import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import StatusBadge from './StatusBadge'

export default function LeadsTable({ leads, pagination, onPageChange, loading }) {
  const navigate = useNavigate()

  if (loading) return (
    <div className="card">
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Loading…</div>
    </div>
  )

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Name</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Phone</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Company</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Retries</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Last called</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-16 text-gray-400">
                  No leads found. Upload a file or add one manually.
                </td>
              </tr>
            ) : leads.map((lead, i) => (
              <tr
                key={lead._id}
                onClick={() => navigate(`/leads/${lead._id}`)}
                className={`cursor-pointer hover:bg-gray-50 transition-colors ${
                  i < leads.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <td className="px-4 py-3 font-medium">
                  {[lead.firstName, lead.lastName].filter(Boolean).join(' ') || (
                    <span className="text-gray-400">Unknown</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-gray-600">{lead.phone}</td>
                <td className="px-4 py-3 text-gray-500 max-w-32 truncate">{lead.company || '—'}</td>
                <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs font-mono ${lead.retryCount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                    {lead.retryCount}/{lead.maxRetries}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {lead.lastCalledAt ? format(new Date(lead.lastCalledAt), 'MMM d, h:mm a') : '—'}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">View →</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-500">{pagination.total} leads total</span>
          <div className="flex items-center gap-2">
            <button
              className="btn py-1 px-2"
              onClick={() => onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-gray-600">
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              className="btn py-1 px-2"
              onClick={() => onPageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
