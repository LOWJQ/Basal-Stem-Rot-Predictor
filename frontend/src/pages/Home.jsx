import { useEffect, useState } from 'react'
import {
  LoaderCircle,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Trash2,
} from 'lucide-react'
import UploadSection from '../services/UploadSection'
import SimpleResultsView from '../services/SimpleResultsView'
import AgentChat from '../services/AgentChat'
import AgentStream from '../services/AgentStream'
import {
  deleteAllHistoryScans,
  deleteHistoryScan,
  fetchHistory,
  fetchHistoryReport,
  fetchHistoryScan,
  predictScan,
} from '../services/api'

function buildAnalysisFormData(entry) {
  const formData = new FormData()
  formData.append('image', entry.file)

  if (entry.lat) formData.append('lat', entry.lat)
  if (entry.lon) formData.append('lon', entry.lon)
  if (entry.altitude) formData.append('altitude', entry.altitude)

  return formData
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [isOpeningHistory, setIsOpeningHistory] = useState(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [historyItems, setHistoryItems] = useState([])
  const [selectedHistoryId, setSelectedHistoryId] = useState(null)
  const [currentResult, setCurrentResult] = useState(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDeletingAllHistory, setIsDeletingAllHistory] = useState(false)
  const [historyActionLoadingId, setHistoryActionLoadingId] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false)
  const [agentStreamData, setAgentStreamData] = useState(null)
  const [showAgentStream, setShowAgentStream] = useState(false)

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
    const handleWindowClick = () => setOpenMenuId(null)
    window.addEventListener('click', handleWindowClick)
    return () => window.removeEventListener('click', handleWindowClick)
  }, [])

  const resetToNewAnalysis = () => {
    setAgentStreamData(null)
    setShowAgentStream(false)
    setCurrentResult(null)
    setSelectedHistoryId(null)
    setError('')
    setIsLoading(false)
    setIsOpeningHistory(false)
    setOpenMenuId(null)
  }

  const handleAnalyzeImage = async (entry) => {
    try {
      setIsLoading(true)
      setError('')
      setCurrentResult(null)
      setSelectedHistoryId(null)
      setAgentStreamData(null)
      setShowAgentStream(false)

      const response = await predictScan(buildAnalysisFormData(entry))
      const result = response.data

      setCurrentResult(result)
      setSelectedHistoryId(result?.history_id ?? null)
      setAgentStreamData(result)
      setShowAgentStream(true)

      await loadHistory()
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenHistory = async (scanId) => {
    try {
      setIsOpeningHistory(true)
      setError('')
      setAgentStreamData(null)
      setShowAgentStream(false)

      const detailResponse = await fetchHistoryScan(scanId)
      const detail = { ...detailResponse.scan }

      if (detail.payload && !detail.payload.report) {
        try {
          const reportResponse = await fetchHistoryReport(scanId)
          detail.payload = { ...detail.payload, report: reportResponse.report }
        } catch {
          // Older scans may not have report data yet.
        }
      }

      if (!detail.payload) {
        throw new Error('Saved analysis payload is unavailable for this scan.')
      }

      setCurrentResult({
        ...detail.payload,
        history_id: detail.id,
        title: detail.title,
        timestamp: detail.timestamp,
      })
      setSelectedHistoryId(detail.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsOpeningHistory(false)
    }
  }

  const handleDeleteAllHistory = async () => {
    try {
      setIsDeletingAllHistory(true)
      setError('')

      await deleteAllHistoryScans()
      await loadHistory()

      setCurrentResult(null)
      setSelectedHistoryId(null)
      setDeleteTarget(null)
      setOpenMenuId(null)
      setIsDeleteAllConfirmOpen(false)
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

  const handleRequestDeleteScan = (event, scan) => {
    event.stopPropagation()
    setOpenMenuId(null)
    setDeleteTarget(scan)
  }

  const handleConfirmDeleteScan = async () => {
    if (!deleteTarget) return

    try {
      setHistoryActionLoadingId(deleteTarget.id)
      await deleteHistoryScan(deleteTarget.id)
      await loadHistory()

      if (selectedHistoryId === deleteTarget.id) {
        setCurrentResult(null)
        setSelectedHistoryId(null)
      }

      setDeleteTarget(null)
      setOpenMenuId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setHistoryActionLoadingId(null)
    }
  }

  const renderMainContent = () => {
    if (isOpeningHistory) {
      return (
        <section className="dashboard-page dashboard-state-page">
          <div className="dashboard-state-panel">
            <LoaderCircle className="history-loading-icon" />
            <p>Opening saved analysis...</p>
          </div>
        </section>
      )
    }

    if (showAgentStream && agentStreamData) {
      return (
        <section className="dashboard-page dashboard-state-page">
          <div className="dashboard-page-header">
            <p className="dashboard-page-label">Autonomous analysis</p>
            <h1 className="dashboard-page-title">PalmGuard AI is preparing the field overview</h1>
            <p className="dashboard-page-description">
              The agent is validating detections, environmental conditions, and spread projections
              before opening the full dashboard.
            </p>
          </div>

          <AgentStream
            analysisData={agentStreamData}
            onComplete={() => setShowAgentStream(false)}
          />
        </section>
      )
    }

    if (currentResult) {
      return (
        <section className="dashboard-page">
          <div className="analysis-results-shell">
            <div className="analysis-results-main">
              <SimpleResultsView result={currentResult} />
            </div>

            <aside className="analysis-results-chat">
              <div className="analysis-results-chat-inner">
                <AgentChat result={currentResult} />
              </div>
            </aside>
          </div>
        </section>
      )
    }

    return (
      <section className="dashboard-page upload-page">
        <div className="dashboard-page-header">
          <p className="dashboard-page-label">Palm Oil Disease Analysis</p>
          <h1 className="dashboard-page-title">From detection to decision in one scan</h1>
          <div className="upload-page-badge-row">
            <span className="upload-page-badge">AI-powered prediction</span>
            <span className="upload-page-badge-text">
              YOLO-V8-based infected tree detection combined with live environmental data
            </span>
          </div>
        </div>

        <UploadSection
          onAnalyze={handleAnalyzeImage}
          isLoading={isLoading}
          error={error}
        />
      </section>
    )
  }

  return (
    <div className="analysis-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="sidebar-app-brand">
            <p className="sidebar-app-kicker">Palm oil disease analytics</p>
            <div className="sidebar-app-name">PalmGuard AI</div>
            <p className="sidebar-app-caption">PalmGuard AI workspace</p>
          </div>

          <button className="sidebar-new button-dark" type="button" onClick={resetToNewAnalysis}>
            <span>New Analysis</span>
          </button>

          <div className="sidebar-section">
            <div className="sidebar-label">RECENT</div>

            <div className="sidebar-list">
              {isHistoryLoading ? (
                <div className="sidebar-state">Loading history...</div>
              ) : historyItems.length ? (
                historyItems.map((scan) => (
                  <div
                    key={scan.id}
                    className={`sidebar-history-row ${selectedHistoryId === scan.id ? 'active' : ''} ${openMenuId === scan.id ? 'menu-open' : ''}`}
                  >
                    <button
                      className={`sidebar-item sidebar-item-main ${selectedHistoryId === scan.id ? 'active' : ''}`}
                      onClick={() => handleOpenHistory(scan.id)}
                      disabled={isOpeningHistory || historyActionLoadingId === scan.id}
                    >
                      <MessageSquare size={15} />
                      <span>{scan.title || `Scan ${scan.id}`}</span>
                    </button>

                    <div className="sidebar-item-actions">
                      <button
                        type="button"
                        className="sidebar-icon-button"
                        onClick={(e) => handleToggleMenu(e, scan.id)}
                        disabled={historyActionLoadingId === scan.id}
                      >
                        <MoreHorizontal size={14} />
                      </button>

                      {openMenuId === scan.id ? (
                        <div
                          className="sidebar-context-menu"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="sidebar-context-item danger"
                            onClick={(e) => handleRequestDeleteScan(e, scan)}
                          >
                            <Trash2 size={14} />
                            <span>Delete</span>
                          </button>
                        </div>
                      ) : null}
                    </div>
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

      <main className="dashboard-main">
        {renderMainContent()}
      </main>

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
                className="settings-close-button button-secondary"
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
                  onClick={() => setIsDeleteAllConfirmOpen(true)}
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
                This will delete <strong>{deleteTarget.title || `Scan ${deleteTarget.id}`}</strong>.
              </p>
            </div>

            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-cancel-button button-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={historyActionLoadingId === deleteTarget.id}
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-confirm-button button-dark"
                onClick={handleConfirmDeleteScan}
                disabled={historyActionLoadingId === deleteTarget.id}
              >
                {historyActionLoadingId === deleteTarget.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDeleteAllConfirmOpen ? (
        <div className="settings-modal-backdrop" onClick={() => setIsDeleteAllConfirmOpen(false)}>
          <div
            className="delete-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="delete-modal-body">
              <h2>Delete all history?</h2>
              <p>
                This will delete every saved history entry. This cannot be undone.
              </p>
            </div>

            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-cancel-button button-secondary"
                onClick={() => setIsDeleteAllConfirmOpen(false)}
                disabled={isDeletingAllHistory}
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-confirm-button button-dark"
                onClick={handleDeleteAllHistory}
                disabled={isDeletingAllHistory}
              >
                {isDeletingAllHistory ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
