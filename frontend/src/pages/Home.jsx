import { useEffect, useState } from 'react'
import {
  LoaderCircle,
  Settings,
  MapPinned,
  Plus,
} from 'lucide-react'
import UploadSection from '../services/UploadSection'
import SimpleResultsView from '../services/SimpleResultsView'
import AgentChat from '../services/AgentChat'
import AgentStream from '../services/AgentStream'
import {
  deleteAllHistoryScans,
  fetchHistory,
  fetchLands,
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
  const [isLandsLoading, setIsLandsLoading] = useState(true)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [error, setError] = useState('')
  const [historyItems, setHistoryItems] = useState([])
  const [lands, setLands] = useState([])
  const [selectedLandId, setSelectedLandId] = useState(null)
  const [isAddingLand, setIsAddingLand] = useState(false)
  const [currentResult, setCurrentResult] = useState(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDeletingAllHistory, setIsDeletingAllHistory] = useState(false)
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false)
  const [agentStreamData, setAgentStreamData] = useState(null)
  const [showAgentStream, setShowAgentStream] = useState(false)

  const loadLands = async () => {
    try {
      setIsLandsLoading(true)
      const response = await fetchLands()
      setLands(response.lands || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLandsLoading(false)
    }
  }

  const loadHistory = async () => {
    try {
      setIsHistoryLoading(true)
      const response = await fetchHistory()
      setHistoryItems(response.scans || [])
    } catch {
      setHistoryItems([])
    } finally {
      setIsHistoryLoading(false)
    }
  }

  useEffect(() => {
    loadLands()
    loadHistory()
  }, [])

  const resetToNewAnalysis = () => {
    setAgentStreamData(null)
    setShowAgentStream(false)
    setCurrentResult(null)
    setSelectedLandId(null)
    setIsAddingLand(true)
    setError('')
    setIsLoading(false)
  }

  const handleAnalyzeImage = async (entry) => {
    try {
      setIsLoading(true)
      setError('')
      setCurrentResult(null)
      setSelectedLandId(null)
      setAgentStreamData(null)
      setShowAgentStream(false)

      const response = await predictScan(buildAnalysisFormData(entry))
      const result = response.data

      setCurrentResult(result)
      setIsAddingLand(false)
      setAgentStreamData(result)
      setShowAgentStream(true)

      await loadLands()
      await loadHistory()
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteAllHistory = async () => {
    try {
      setIsDeletingAllHistory(true)
      setError('')

      await deleteAllHistoryScans()
      await loadHistory()

      setCurrentResult(null)
      setIsDeleteAllConfirmOpen(false)
      setIsSettingsOpen(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsDeletingAllHistory(false)
    }
  }

  const formatRelativeTime = (value) => {
    if (!value) return 'No scans yet'

    const timestamp = new Date(value).getTime()
    if (Number.isNaN(timestamp)) return 'Unknown'

    const diffMs = Date.now() - timestamp
    const minute = 60 * 1000
    const hour = 60 * minute
    const day = 24 * hour
    const week = 7 * day
    const month = 30 * day

    if (diffMs < hour) {
      const minutes = Math.max(1, Math.round(diffMs / minute))
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
    }

    if (diffMs < day) {
      const hours = Math.round(diffMs / hour)
      return `${hours} hour${hours === 1 ? '' : 's'} ago`
    }

    if (diffMs < week) {
      const days = Math.round(diffMs / day)
      return `${days} day${days === 1 ? '' : 's'} ago`
    }

    if (diffMs < month) {
      const weeks = Math.round(diffMs / week)
      return `${weeks} week${weeks === 1 ? '' : 's'} ago`
    }

    const months = Math.round(diffMs / month)
    return `${months} month${months === 1 ? '' : 's'} ago`
  }

  const getRiskMeta = (land) => {
    const score = Number(land?.latest_risk_score ?? 0)

    if (score >= 66) {
      return { label: 'High', icon: '🔴', className: 'high' }
    }

    if (score >= 33) {
      return { label: 'Medium', icon: '🟡', className: 'medium' }
    }

    return { label: 'Low', icon: '🟢', className: 'low' }
  }

  const renderMainContent = () => {
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

    if (isAddingLand) {
      return (
        <section className="dashboard-page upload-page">
          <div className="upload-page-topbar">
            <button
              type="button"
              className="button-secondary upload-back-button"
              onClick={() => {
                setIsAddingLand(false)
                setError('')
              }}
            >
              {'<- Back'}
            </button>
          </div>

          <div className="dashboard-page-header upload-page-header">
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

    if (selectedLandId !== null) {
      const selectedLand = lands.find((land) => land.id === selectedLandId)

      return (
        <section className="dashboard-page lands-page">
          <div className="land-detail-placeholder">
            <button
              type="button"
              className="button-secondary land-detail-back"
              onClick={() => setSelectedLandId(null)}
            >
              {'<- Back'}
            </button>
            <p className="dashboard-page-label">Plantation land</p>
            <h1 className="dashboard-page-title">
              {selectedLand?.name || 'Unnamed Land'}
            </h1>
            <p className="dashboard-page-description">Land Detail — coming in next step</p>
          </div>
        </section>
      )
    }

    if (isLandsLoading) {
      return (
        <section className="dashboard-page dashboard-state-page">
          <div className="dashboard-state-panel">
            <LoaderCircle className="history-loading-icon" />
            <p>Loading plantation lands...</p>
          </div>
        </section>
      )
    }

    if (!lands.length) {
      return (
        <section className="dashboard-page lands-page">
          <div className="lands-header">
            <p className="dashboard-page-label">Plantation overview</p>
            <h1 className="dashboard-page-title">My Plantation Lands</h1>
          </div>

          <div className="lands-empty-state">
            <p className="lands-empty-title">You have no plantation lands yet.</p>
            <p className="lands-empty-copy">Upload your first image to get started.</p>
            <button
              type="button"
              className="button-dark sidebar-new lands-add-button"
              onClick={resetToNewAnalysis}
            >
              <Plus size={16} />
              <span>Add New Land</span>
            </button>
          </div>
        </section>
      )
    }

    return (
      <section className="dashboard-page lands-page">
        <div className="lands-header">
          <p className="dashboard-page-label">Plantation overview</p>
          <h1 className="dashboard-page-title">My Plantation Lands</h1>
          <button
            type="button"
            className="button-dark sidebar-new lands-add-button"
            onClick={resetToNewAnalysis}
          >
            <Plus size={16} />
            <span>Add New Land</span>
          </button>
        </div>

        <div className="lands-list">
          {lands.map((land) => {
            const riskMeta = getRiskMeta(land)
            const landName = land.name || 'Unnamed Land'

            return (
              <button
                key={land.id}
                type="button"
                className="land-card"
                onClick={() => setSelectedLandId(land.id)}
              >
                <div className="land-card-title-row">
                  <div className="land-card-title-wrap">
                    <MapPinned size={18} />
                    <span className={`land-card-title ${land.name ? '' : 'untitled'}`}>
                      {landName}
                    </span>
                  </div>
                  <span className={`land-risk-badge ${riskMeta.className}`}>
                    {riskMeta.icon} {riskMeta.label}
                  </span>
                </div>

                <div className="land-card-meta">
                  <span>{land.scan_count || 0} scans</span>
                  <span>Last scan: {formatRelativeTime(land.last_scan_at)}</span>
                </div>
              </button>
            )
          })}
        </div>
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
            <Plus size={16} />
            <span>Add New Land</span>
          </button>
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
