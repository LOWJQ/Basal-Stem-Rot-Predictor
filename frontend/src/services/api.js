const API_BASE = 'https://divine-surprise-production-58e6.up.railway.app'

async function parseResponse(response, fallbackMessage) {
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error || fallbackMessage)
  }

  return data
}

export async function predictScan(formData) {
  const response = await fetch(`${API_BASE}/predict`, {
    method: 'POST',
    body: formData,
  })

  return parseResponse(response, 'Prediction failed')
}

export async function fetchHistory() {
  const response = await fetch(`${API_BASE}/history`)
  return parseResponse(response, 'Failed to load history')
}

export async function fetchHistoryScan(scanId) {
  const response = await fetch(`${API_BASE}/history/${scanId}`)
  return parseResponse(response, 'Failed to load history entry')
}

export async function fetchHistoryReport(scanId) {
  const response = await fetch(`${API_BASE}/history/${scanId}/report`)
  return parseResponse(response, 'Failed to load report preview')
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
    },
    body: JSON.stringify({ title }),
  })

  return parseResponse(response, 'Failed to rename history entry')
}

export async function deleteHistoryScan(scanId) {
  const response = await fetch(`${API_BASE}/history/${scanId}`, {
    method: 'DELETE',
  })

  return parseResponse(response, 'Failed to delete history entry')
}

export async function deleteAllHistoryScans() {
  const response = await fetch(`${API_BASE}/history`, {
    method: 'DELETE',
  })

  return parseResponse(response, 'Failed to delete all history')
}
