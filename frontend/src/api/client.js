import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 15000,
})

// ── Leads ─────────────────────────────────────────────────────────────────────
export const leadsApi = {
  list: (params) =>
    api.get('/leads', { params }).then(r => r.data),

  stats: () =>
    api.get('/leads/stats').then(r => r.data),

  get: (id) =>
    api.get(`/leads/${id}`).then(r => r.data),

  create: (body) =>
    api.post('/leads', body).then(r => r.data),

  update: (id, body) =>
    api.patch(`/leads/${id}`, body).then(r => r.data),

  delete: (id) =>
    api.delete(`/leads/${id}`).then(r => r.data),

  retry: (id) =>
    api.post(`/leads/${id}/retry`).then(r => r.data),

  bulkUpload: (file) => {
    const fd = new FormData()
    fd.append('file', file)
    return api.post('/leads/bulk-upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data)
  },

  startCalling: (batchId) =>
    api.post('/leads/start-calling', null, { params: batchId ? { batchId } : {} }).then(r => r.data),
}

// ── Queue / Worker ─────────────────────────────────────────────────────────────
export const queueApi = {
  stats:  () => api.get('/queue/stats').then(r => r.data),
  pause:  () => api.post('/queue/pause').then(r => r.data),
  resume: () => api.post('/queue/resume').then(r => r.data),
}

export default api
