import { useEffect, useState } from 'react'
import { Check, LoaderCircle, MessageSquare, Pencil, Settings, Trash2, X } from 'lucide-react'
import UploadSection from '../services/UploadSection'
import {
  deleteAllHistoryScans,
  deleteHistoryScan,
  fetchHistory,
  fetchHistoryScan,
  predictScan,
  renameHistoryScan,
} from '../services/api'
import SimpleResultsView from '../services/SimpleResultsView'
import HistorySummaryView from '../services/HistorySummaryView'

function formatHistoryTitle(scan) {
  if (scan.title && scan.title.trim()) {
    return scan.title
  }

  const timestamp = new Date(scan.timestamp)
  const formattedTime = Number.isNaN(timestamp.getTime())
    ? 'Saved scan'
    : timestamp.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })

  const lat = Number.isFinite(Number(scan.lat)) ? Number(scan.lat).toFixed(4) : 'N/A'
  const lon = Number.isFinite(Number(scan.lon)) ? Number(scan.lon).toFixed(4) : 'N/A'

  return `${formattedTime} - ${lat}, ${lon}`
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [isOpeningHistory, setIsOpeningHistory] = useState(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [result, setResult] = useState(null)
  const [historySummary, setHistorySummary] = useState(null)
  const [historyItems, setHistoryItems] = useState([])
  const [editingHistoryId, setEditingHistoryId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [historyActionLoadingId, setHistoryActionLoadingId] = useState(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDeletingAllHistory, setIsDeletingAllHistory] = useState(false)

  const activeHistoryId = result?.history_id ?? historySummary?.id ?? null

  const loadHistory = async () => {
    try {
      setIsHistoryLoading(true)
      setHistoryError('')
      const response = await fetchHistory()
      setHistoryItems(response.scans || [])
    } catch (err) {
      setHistoryError(err.message)
    } finally {
      setIsHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const resetToNewAnalysis = () => {
    setResult(null)
    setHistorySummary(null)
    setError('')
    setIsLoading(false)
    setIsOpeningHistory(false)
  }

  const handleSubmit = async (formData) => {
    try {
      setIsLoading(true)
      setError('')
      setHistorySummary(null)

      const response = await predictScan(formData)
      setResult(response.data)
      await loadHistory()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenHistory = async (scanId) => {
    try {
      setIsOpeningHistory(true)
      setError('')
      setResult(null)
      setHistorySummary(null)

      const response = await fetchHistoryScan(scanId)
      const scan = response.scan

      if (scan.payload) {
        setResult(scan.payload)
      } else {
        setHistorySummary(scan)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsOpeningHistory(false)
    }
  }

  const handleStartRename = (event, scan) => {
    event.stopPropagation()
    setEditingHistoryId(scan.id)
    setEditingTitle(scan.title || formatHistoryTitle(scan))
  }

  const handleCancelRename = () => {
    setEditingHistoryId(null)
    setEditingTitle('')
  }

  const handleSaveRename = async (event, scanId) => {
    event.stopPropagation()

    const trimmedTitle = editingTitle.trim()
    if (!trimmedTitle) return

    try {
      setHistoryActionLoadingId(scanId)
      await renameHistoryScan(scanId, trimmedTitle)
      await loadHistory()

      if (result?.history_id === scanId) {
        setResult((current) => current ? { ...current, title: trimmedTitle } : current)
      }

      if (historySummary?.id === scanId) {
        setHistorySummary((current) => current ? { ...current, title: trimmedTitle } : current)
      }

      handleCancelRename()
    } catch (err) {
      setError(err.message)
    } finally {
      setHistoryActionLoadingId(null)
    }
  }

  const handleDeleteHistory = async (event, scanId) => {
    event.stopPropagation()

    const confirmed = window.confirm('Delete this history entry?')
    if (!confirmed) return

    try {
      setHistoryActionLoadingId(scanId)
      await deleteHistoryScan(scanId)
      await loadHistory()

      if (result?.history_id === scanId) {
        setResult(null)
      }

      if (historySummary?.id === scanId) {
        setHistorySummary(null)
      }

      if (editingHistoryId === scanId) {
        handleCancelRename()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setHistoryActionLoadingId(null)
    }
  }

  const handleDeleteAllHistory = async () => {
    const confirmed = window.confirm('Delete all history entries? This cannot be undone.')
    if (!confirmed) return

    try {
      setIsDeletingAllHistory(true)
      setError('')

      await deleteAllHistoryScans()
      await loadHistory()

      setResult(null)
      setHistorySummary(null)
      handleCancelRename()
      setIsSettingsOpen(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsDeletingAllHistory(false)
    }
  }



  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-top">
          <button className="sidebar-new" onClick={resetToNewAnalysis}>
            <span>New analysis</span>
          </button>

          <div className="sidebar-section">
            <div className="sidebar-label">Recent</div>

            <div className="sidebar-list">
              {isHistoryLoading ? (
                <div className="sidebar-state">Loading history...</div>
              ) : historyItems.length ? (
                historyItems.map((item) => (
                  <div
                    key={item.id}
                    className={`sidebar-history-row ${activeHistoryId === item.id ? 'active' : ''}`}
                  >
                    {editingHistoryId === item.id ? (
                      <>
                        <input
                          className="sidebar-rename-input"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          maxLength={80}
                          autoFocus
                        />

                        <div className="sidebar-item-actions">
                          <button
                            type="button"
                            className="sidebar-icon-button"
                            onClick={(e) => handleSaveRename(e, item.id)}
                            disabled={historyActionLoadingId === item.id}
                          >
                            <Check size={14} />
                          </button>

                          <button
                            type="button"
                            className="sidebar-icon-button"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCancelRename()
                            }}
                            disabled={historyActionLoadingId === item.id}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <button
                          className={`sidebar-item sidebar-item-main ${activeHistoryId === item.id ? 'active' : ''}`}
                          onClick={() => handleOpenHistory(item.id)}
                          disabled={isOpeningHistory || historyActionLoadingId === item.id}
                        >
                          <MessageSquare size={15} />
                          <span>{formatHistoryTitle(item)}</span>
                        </button>

                        <div className="sidebar-item-actions">
                          <button
                            type="button"
                            className="sidebar-icon-button"
                            onClick={(e) => handleStartRename(e, item)}
                            disabled={historyActionLoadingId === item.id}
                          >
                            <Pencil size={14} />
                          </button>

                          <button
                            type="button"
                            className="sidebar-icon-button danger"
                            onClick={(e) => handleDeleteHistory(e, item.id)}
                            disabled={historyActionLoadingId === item.id}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))

              ) : (
                <div className="sidebar-state">No saved analyses yet.</div>
              )}
            </div>

            {historyError ? <div className="sidebar-error">{historyError}</div> : null}
          </div>
        </div>

        <div className="sidebar-bottom">
          <button
            className="sidebar-item"
            type="button"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings size={15} />
            <span>Settings</span>
          </button>
        </div>
      </aside>

      <div className="main-panel">
        <header className="topbar">
          <div className="brand">Basal Stem Rot Predictor</div>
        </header>

        <main className="hero-layout">
          <div className="hero-content">
            {isOpeningHistory ? (
              <div className="history-loading-panel">
                <LoaderCircle className="history-loading-icon" />
                <p>Opening saved analysis...</p>
              </div>
            ) : result ? (
              <SimpleResultsView result={result} />
            ) : historySummary ? (
              <HistorySummaryView scan={historySummary} />
            ) : (
              <>
                <p className="hero-kicker">Palm oil disease analysis</p>
                <h1 className="hero-title">Analyze from one image</h1>
                <p className="hero-subtitle">
                  Upload an image and location to generate a risk map.
                </p>

                <UploadSection
                  onSubmit={handleSubmit}
                  isLoading={isLoading}
                  error={error}
                />
              </>
            )}
          </div>
        </main>
      </div>

      {isSettingsOpen ? (
        <div className="settings-modal-backdrop" onClick={() => setIsSettingsOpen(false)}>
          <div
            className="settings-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="settings-modal-header">
              <h2>Settings</h2>
              <button
                type="button"
                className="settings-close-button"
                onClick={() => setIsSettingsOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="settings-modal-body">
              <div className="settings-section">
                <h3>History</h3>
                <p className="settings-section-text">
                  Delete every saved analysis from the sidebar at once.
                </p>

                <button
                  type="button"
                  className="settings-danger-button"
                  onClick={handleDeleteAllHistory}
                  disabled={isDeletingAllHistory || !historyItems.length}
                >
                  {isDeletingAllHistory ? 'Deleting...' : 'Delete all history'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}
