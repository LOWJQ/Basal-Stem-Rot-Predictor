export function getDeviceId() {
  let id = localStorage.getItem('bsr_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('bsr_device_id', id)
  }
  return id
}

const DEPLOYED_API_BASE = 'https://divine-surprise-production-58e6.up.railway.app'
const LOCAL_API_BASE = 'http://127.0.0.1:5000'

function resolveApiBase() {
  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL
  }

  const hostname = window.location.hostname
  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'

  return isLocalhost ? LOCAL_API_BASE : DEPLOYED_API_BASE
}

const API_BASE = resolveApiBase()

async function parseResponse(response, fallbackMessage) {
  let data = {}

  try {
    data = await response.json()
  } catch {
    if (!response.ok) {
      throw new Error(fallbackMessage)
    }
  }

  if (!response.ok) {
    throw new Error(data.error || fallbackMessage)
  }

  return data
}

export async function predictScan(formData) {
  try {
    const response = await fetch(`${API_BASE}/predict`, {
      method: 'POST',
      headers: { 'X-Device-Id': getDeviceId() },
      body: formData,
    })

    return parseResponse(response, 'Prediction failed')
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Failed to reach the analysis server. Try fewer images or retry in a moment.')
    }

    throw error
  }
}

export async function fetchHistory() {
  const response = await fetch(`${API_BASE}/history`, {
    headers: { 'X-Device-Id': getDeviceId() },
  })
  return parseResponse(response, 'Failed to load history')
}

export async function fetchHistoryScan(scanId) {
  const response = await fetch(`${API_BASE}/history/${scanId}`, {
    headers: { 'X-Device-Id': getDeviceId() },
  })
  return parseResponse(response, 'Failed to load history entry')
}

export async function fetchHistoryReport(scanId) {
  const response = await fetch(`${API_BASE}/history/${scanId}/report`, {
    headers: { 'X-Device-Id': getDeviceId() },
  })
  return parseResponse(response, 'Failed to load report preview')
}

export async function fetchHistorySimulationFrames(scanId) {
  const response = await fetch(`${API_BASE}/history/${scanId}/simulation-frames`, {
    headers: { 'X-Device-Id': getDeviceId() },
  })
  return parseResponse(response, 'Failed to load simulation frames')
}

export function getHistoryReportPdfUrl(scanId) {
  return `${API_BASE}/history/${scanId}/report/pdf`
}

export function getHistoryReportExcelUrl(scanId) {
  return `${API_BASE}/history/${scanId}/report/excel`
}

export async function renameHistoryScan(scanId, title) {
  const response = await fetch(`${API_BASE}/history/${scanId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': getDeviceId(),
    },
    body: JSON.stringify({ title }),
  })

  return parseResponse(response, 'Failed to rename history entry')
}

export async function deleteHistoryScan(scanId) {
  const response = await fetch(`${API_BASE}/history/${scanId}`, {
    method: 'DELETE',
    headers: { 'X-Device-Id': getDeviceId() },
  })

  return parseResponse(response, 'Failed to delete history entry')
}

export async function deleteAllHistoryScans() {
  const response = await fetch(`${API_BASE}/history`, {
    method: 'DELETE',
    headers: { 'X-Device-Id': getDeviceId() },
  })

  return parseResponse(response, 'Failed to delete all history')
}
