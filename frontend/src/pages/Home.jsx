import { useEffect, useState } from 'react'
import {
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Settings,
  Trash2,
} from 'lucide-react'
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
  const [openMenuId, setOpenMenuId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

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

  useEffect(() => {
    const handleWindowClick = () => {
      setOpenMenuId(null)
    }

    window.addEventListener('click', handleWindowClick)
    return () => window.removeEventListener('click', handleWindowClick)
  }, [])

  const resetToNewAnalysis = () => {
    setResult(null)
    setHistorySummary(null)
    setError('')
    setIsLoading(false)
    setIsOpeningHistory(false)
    setOpenMenuId(null)
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
      setOpenMenuId(null)
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
    setOpenMenuId(null)
  }

  const handleCancelRename = () => {
    setOpenMenuId(null)
    setEditingHistoryId(null)
    setEditingTitle('')
  }

  const handleSaveRename = async (scanId) => {
    const trimmedTitle = editingTitle.trim()
    if (!trimmedTitle) {
      handleCancelRename()
      return
    }

    const currentItem = historyItems.find((item) => item.id === scanId)
    if (currentItem && trimmedTitle === formatHistoryTitle(currentItem)) {
      handleCancelRename()
      return
    }

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

  const handleRequestDeleteHistory = (event, item) => {
    event.stopPropagation()
    setOpenMenuId(null)
    setDeleteTarget(item)
  }

  const handleConfirmDeleteHistory = async () => {
    if (!deleteTarget) return

    const scanId = deleteTarget.id

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

      setOpenMenuId(null)
      setDeleteTarget(null)
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

  const handleToggleMenu = (event, scanId) => {
    event.stopPropagation()
    setOpenMenuId((current) => (current === scanId ? null : scanId))
  }

  const handleRenameKeyDown = async (event, scanId) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      await handleSaveRename(scanId)
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancelRename()
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
                    className={`sidebar-history-row ${activeHistoryId === item.id ? 'active' : ''} ${openMenuId === item.id ? 'menu-open' : ''}`}
                  >
                    {editingHistoryId === item.id ? (
                      <>
                        <input
                          className="sidebar-rename-input"
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => {
                            handleSaveRename(item.id)
                          }}
                          onKeyDown={(e) => handleRenameKeyDown(e, item.id)}
                          maxLength={80}
                          autoFocus
                        />
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
                            className="sidebar-icon-button menu-trigger"
                            onClick={(e) => handleToggleMenu(e, item.id)}
                            disabled={historyActionLoadingId === item.id}
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {openMenuId === item.id ? (
                            <div
                              className="sidebar-context-menu"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                className="sidebar-context-item"
                                onClick={(e) => handleStartRename(e, item)}
                              >
                                <Pencil size={14} />
                                <span>Rename</span>
                              </button>

                              <button
                                type="button"
                                className="sidebar-context-item danger"
                                onClick={(e) => handleRequestDeleteHistory(e, item)}
                              >
                                <Trash2 size={14} />
                                <span>Delete</span>
                              </button>
                            </div>
                          ) : null}
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
                <h1 className="hero-title">From detection to decision in one scan</h1>
                <p className="hero-subtitle">
                  Upload an image and location to generate a risk map.
                </p>
                <div className="hero-trust-row">
                  <span className="hero-trust-pill">AI-powered prediction</span>
                  <span className="hero-trust-text">
                    YOLO-V8-based infected tree detection combined with live environmental data
                  </span>
                </div>

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

      {deleteTarget ? (
        <div className="settings-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div
            className="delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="delete-modal-body">
              <h2>Delete history?</h2>
              <p>
                This will delete <strong>{formatHistoryTitle(deleteTarget)}</strong>.
              </p>
            </div>

            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-cancel-button"
                onClick={() => setDeleteTarget(null)}
                disabled={historyActionLoadingId === deleteTarget.id}
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-confirm-button"
                onClick={handleConfirmDeleteHistory}
                disabled={historyActionLoadingId === deleteTarget.id}
              >
                {historyActionLoadingId === deleteTarget.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}
