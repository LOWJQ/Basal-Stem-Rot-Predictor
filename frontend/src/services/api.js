const API_BASE = 'https://divine-surprise-production-58e6.up.railway.app'

// const API_BASE = 'http://127.0.0.1:5000'

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

export async function fetchHistorySimulationFrames(scanId) {
  const response = await fetch(`${API_BASE}/history/${scanId}/simulation-frames`)
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
