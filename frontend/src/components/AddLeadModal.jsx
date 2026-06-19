import { useState } from 'react'
import { X } from 'lucide-react'
import { leadsApi } from '../api/client'
import toast from 'react-hot-toast'

export default function AddLeadModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', email: '', company: '' })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.phone.trim()) { toast.error('Phone number is required'); return }
    setLoading(true)
    try {
      await leadsApi.create(form)
      toast.success('Lead added')
      onSuccess()
      onClose()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to add lead')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold">Add lead</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First name</label>
              <input className="input" placeholder="Jane" value={form.firstName} onChange={e => set('firstName', e.target.value)} />
            </div>
            <div>
              <label className="label">Last name</label>
              <input className="input" placeholder="Smith" value={form.lastName} onChange={e => set('lastName', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="label">Phone *</label>
            <input className="input" placeholder="+1 555 000 0000" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" placeholder="jane@company.com" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div>
            <label className="label">Company</label>
            <input className="input" placeholder="Acme Corp" value={form.company} onChange={e => set('company', e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Adding…' : 'Add lead'}
          </button>
        </div>
      </div>
    </div>
  )
}
