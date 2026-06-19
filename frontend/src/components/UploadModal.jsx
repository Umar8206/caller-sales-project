import { useState, useRef } from 'react'
import { X, Upload, FileSpreadsheet, FileText, CheckCircle } from 'lucide-react'
import { leadsApi } from '../api/client'
import toast from 'react-hot-toast'

export default function UploadModal({ onClose, onSuccess }) {
  const [file, setFile]       = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState(null)
  const inputRef = useRef()

  const handleFile = (f) => {
    if (!f) return
    const ok = /\.(xlsx|xls|docx|doc)$/i.test(f.name)
    if (!ok) { toast.error('Only .xlsx, .xls, .docx, .doc files accepted'); return }
    setFile(f)
    setResult(null)
  }

  const onDrop = (e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }

  const upload = async () => {
    if (!file) { toast.error('Please select a file'); return }
    setLoading(true)
    try {
      const res = await leadsApi.bulkUpload(file)
      setResult(res)
      onSuccess()
      toast.success(`${res.created} leads imported`)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Upload failed')
    } finally { setLoading(false) }
  }

  const isExcel = file && /\.(xlsx|xls)$/i.test(file.name)
  const Icon    = isExcel ? FileSpreadsheet : FileText

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold">Bulk upload leads</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5">
          {!result ? (
            <>
              <p className="text-sm text-gray-500 mb-4">
                Upload an <strong>Excel</strong> (.xlsx/.xls) or <strong>Word</strong> (.docx) file.
                Excel columns: <code className="bg-gray-100 px-1 rounded text-xs">first_name, last_name, phone, email, company</code>
              </p>

              <div
                onClick={() => inputRef.current.click()}
                onDrop={onDrop}
                onDragOver={e => e.preventDefault()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  file ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  className="hidden"
                  accept=".xlsx,.xls,.docx,.doc"
                  onChange={e => handleFile(e.target.files[0])}
                />
                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <Icon size={24} className="text-green-600" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-green-700">{file.name}</p>
                      <p className="text-xs text-green-600">{(file.size / 1024).toFixed(0)} KB</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload size={24} className="mx-auto text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">Drag & drop or click to select</p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx · .xls · .docx · .doc</p>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-700 mb-4">
                <CheckCircle size={20} />
                <span className="font-medium">Upload complete</span>
              </div>
              <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Total rows</span><span className="font-medium">{result.total}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Created</span><span className="font-medium text-green-600">{result.created}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Duplicates skipped</span><span className="font-medium">{result.skipped}</span></div>
                {result.invalid > 0 && (
                  <div className="flex justify-between"><span className="text-gray-500">Invalid rows</span><span className="font-medium text-red-600">{result.invalid}</span></div>
                )}
              </div>
              <p className="text-xs text-gray-500 pt-1">
                Batch ID: <code className="bg-gray-100 px-1 rounded">{result.batchId}</code>
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button className="btn" onClick={onClose}>{result ? 'Close' : 'Cancel'}</button>
          {!result && (
            <button className="btn btn-primary" onClick={upload} disabled={loading || !file}>
              {loading ? 'Uploading…' : 'Upload'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
