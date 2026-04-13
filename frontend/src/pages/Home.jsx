import { useEffect, useState } from 'react'
import {
  BarChart2,
  CreditCard,
  FileText,
  HelpCircle,
  Home as HomeIcon,
  LoaderCircle,
  MapPinned,
  MoreHorizontal,
  Plus,
  Settings,
  User,
} from 'lucide-react'
import UploadSection from '../services/UploadSection'
import SimpleResultsView from '../services/SimpleResultsView'
import AgentChat from '../services/AgentChat'
import AgentStream from '../services/AgentStream'
import {
  deleteAllHistoryScans,
  deleteLand,
  fetchHistory,
  fetchHistoryScan,
  fetchLands,
  fetchLandScans,
  predictScan,
  renameLand,
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
  const [activeView, setActiveView] = useState('home')
  const [currentResult, setCurrentResult] = useState(null)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDeletingAllHistory, setIsDeletingAllHistory] = useState(false)
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false)
  const [agentStreamData, setAgentStreamData] = useState(null)
  const [showAgentStream, setShowAgentStream] = useState(false)
  const [newLandId, setNewLandId] = useState(null)
  const [landNameInput, setLandNameInput] = useState('')
  const [isSavingLandName, setIsSavingLandName] = useState(false)
  const [landNameSaved, setLandNameSaved] = useState(false)
  const [landMenuOpenId, setLandMenuOpenId] = useState(null)
  const [renamingLandId, setRenamingLandId] = useState(null)
  const [renamingLandValue, setRenamingLandValue] = useState('')
  const [isDeletingLandId, setIsDeletingLandId] = useState(null)
  const [deleteConfirmLandId, setDeleteConfirmLandId] = useState(null)
  const [landScans, setLandScans] = useState([])
  const [isLandScansLoading, setIsLandScansLoading] = useState(false)
  const [selectedScanId, setSelectedScanId] = useState(null)
  const [selectedScanResult, setSelectedScanResult] = useState(null)
  const [isLoadingScan, setIsLoadingScan] = useState(false)

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

  useEffect(() => {
    const handleWindowClick = () => setLandMenuOpenId(null)
    window.addEventListener('click', handleWindowClick)
    return () => window.removeEventListener('click', handleWindowClick)
  }, [])

  useEffect(() => {
    if (selectedLandId === null) {
      setLandScans([])
      setSelectedScanId(null)
      setSelectedScanResult(null)
      return
    }

    const load = async () => {
      try {
        setIsLandScansLoading(true)
        const response = await fetchLandScans(selectedLandId)
        const scans = (response.scans || []).reverse()
        setLandScans(scans)
      } catch (err) {
        setError(err.message)
      } finally {
        setIsLandScansLoading(false)
      }
    }

    load()
  }, [selectedLandId])

  const resetToNewAnalysis = () => {
    setActiveView('home')
    setAgentStreamData(null)
    setShowAgentStream(false)
    setCurrentResult(null)
    setNewLandId(null)
    setLandNameInput('')
    setLandNameSaved(false)
    setSelectedLandId(null)
    setSelectedScanId(null)
    setSelectedScanResult(null)
    setIsAddingLand(true)
    setError('')
    setIsLoading(false)
  }

  const handleAnalyzeImage = async (entry) => {
    try {
      setActiveView('home')
      setIsLoading(true)
      setError('')
      setCurrentResult(null)
      setSelectedLandId(null)
      setSelectedScanId(null)
      setSelectedScanResult(null)
      setAgentStreamData(null)
      setShowAgentStream(false)

      const response = await predictScan(buildAnalysisFormData(entry))
      const result = response.data

      setCurrentResult(result)
      setIsAddingLand(false)
      setAgentStreamData(result)
      setShowAgentStream(true)
      setLandNameSaved(false)

      if (result?.land_id) {
        const scansResponse = await fetchLandScans(result.land_id)
        setLandScans((scansResponse.scans || []).reverse())
      } else {
        setLandScans([])
      }

      await loadLands()
      const landId = result?.land_id ?? null
      if (landId) {
        const updatedLands = await fetchLands()
        const matchedLand = (updatedLands.lands || []).find((land) => land.id === landId)
        setLands(updatedLands.lands || [])
        if (matchedLand && !matchedLand.name) {
          setNewLandId(landId)
          setLandNameInput('')
          setLandNameSaved(false)
        } else {
          setNewLandId(null)
        }
      } else {
        setNewLandId(null)
      }
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

  const handleSaveLandName = async () => {
    if (!landNameInput.trim() || !newLandId) return

    try {
      setIsSavingLandName(true)
      await renameLand(newLandId, landNameInput.trim())
      await loadLands()
      setLandNameSaved(true)
      setNewLandId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsSavingLandName(false)
    }
  }

  const handleRenameLand = async (landId) => {
    if (!renamingLandValue.trim()) return
    try {
      await renameLand(landId, renamingLandValue.trim())
      await loadLands()
      setRenamingLandId(null)
      setRenamingLandValue('')
      setLandMenuOpenId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteLand = async (landId) => {
    try {
      setIsDeletingLandId(landId)
      await deleteLand(landId)
      await loadLands()
      setDeleteConfirmLandId(null)
      setLandMenuOpenId(null)
      if (selectedLandId === landId) setSelectedLandId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setIsDeletingLandId(null)
    }
  }

  const goHome = () => {
    setActiveView('home')
    setSelectedLandId(null)
    setSelectedScanId(null)
    setSelectedScanResult(null)
    setIsAddingLand(false)
    setCurrentResult(null)
    setNewLandId(null)
    setLandNameInput('')
    setLandNameSaved(false)
    setLandMenuOpenId(null)
    setRenamingLandId(null)
    setRenamingLandValue('')
    setDeleteConfirmLandId(null)
    setAgentStreamData(null)
    setShowAgentStream(false)
    setError('')
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

  const buildScanComparison = (scans, currentScanId) => {
    if (!scans || scans.length === 0) return null

    const orderedScans = [...scans].reverse()
    const currentIndex = orderedScans.findIndex((scan) => scan.id === currentScanId)
    if (currentIndex === -1) return null

    const first = orderedScans[0]
    const current = orderedScans[currentIndex]
    const previous = currentIndex > 0 ? orderedScans[currentIndex - 1] : null

    const toPercent = (val) => {
      const n = Number(val ?? 0)
      return `${(n * 100).toFixed(1)}%`
    }

    const getRiskClass = (val) => {
      const n = Number(val ?? 0)
      if (n >= 0.66) return 'high'
      if (n >= 0.33) return 'medium'
      return 'low'
    }

    return {
      first,
      previous,
      current,
      toPercent,
      getRiskClass,
      isFirstScan: currentIndex === 0,
      isSecondScan: currentIndex === 1,
    }
  }

  const getPrevScan = (scans, currentId) => {
    if (!scans || scans.length === 0) return null
    const currentIndex = scans.findIndex((scan) => scan.id === currentId)
    if (currentIndex <= 0) return null
    return scans[currentIndex - 1]
  }

  const handleSelectScan = async (scanId) => {
    try {
      setIsLoadingScan(true)
      setSelectedScanId(scanId)
      const response = await fetchHistoryScan(scanId)
      const scan = response.scan
      const payload = scan?.payload ?? {}
      setCurrentResult(null)
      setSelectedScanResult({ ...payload, history_id: scan.id, land_id: scan.land_id })
    } catch (err) {
      setError(err.message)
    } finally {
      setIsLoadingScan(false)
    }
  }

  const ScanComparisonBar = ({ scans, currentScanId }) => {
    const data = buildScanComparison(scans, currentScanId)
    if (!data) return null

    const { first, previous, current, toPercent, getRiskClass, isFirstScan, isSecondScan } = data

    if (isFirstScan) {
      return (
        <div className="scan-comparison-bar baseline">
          <span className="scan-comparison-label">
            This is the first scan for this land - baseline established.
          </span>
        </div>
      )
    }

    if (isSecondScan) {
      return (
        <div className="scan-comparison-bar">
          <div className="scan-comparison-point">
            <span className="scan-comparison-point-label">First Scan</span>
            <span className={`scan-comparison-score ${getRiskClass(first.avg_risk_score)}`}>
              {toPercent(first.avg_risk_score)}
            </span>
            <span className="scan-comparison-date">{formatRelativeTime(first.timestamp)}</span>
          </div>
          <div className="scan-comparison-arrow">{'->'}</div>
          <div className="scan-comparison-point current">
            <span className="scan-comparison-point-label">Now</span>
            <span className={`scan-comparison-score ${getRiskClass(current.avg_risk_score)}`}>
              {toPercent(current.avg_risk_score)}
            </span>
            <span className="scan-comparison-date">{formatRelativeTime(current.timestamp)}</span>
          </div>
        </div>
      )
    }

    const change =
      Number(current.avg_risk_score ?? 0) - Number(previous.avg_risk_score ?? 0)
    const changeLabel =
      change > 0
        ? `+${(change * 100).toFixed(1)}%`
        : change < 0
          ? `${(change * 100).toFixed(1)}%`
          : 'No change'

    return (
      <div className="scan-comparison-bar">
        <div className="scan-comparison-point">
          <span className="scan-comparison-point-label">First Scan</span>
          <span className={`scan-comparison-score ${getRiskClass(first.avg_risk_score)}`}>
            {toPercent(first.avg_risk_score)}
          </span>
          <span className="scan-comparison-date">{formatRelativeTime(first.timestamp)}</span>
        </div>
        <div className="scan-comparison-arrow">{'->'}</div>
        <div className="scan-comparison-point">
          <span className="scan-comparison-point-label">Last Scan</span>
          <span className={`scan-comparison-score ${getRiskClass(previous.avg_risk_score)}`}>
            {toPercent(previous.avg_risk_score)}
          </span>
          <span className="scan-comparison-date">{formatRelativeTime(previous.timestamp)}</span>
        </div>
        <div className="scan-comparison-arrow">{'->'}</div>
        <div className="scan-comparison-point current">
          <span className="scan-comparison-point-label">Now</span>
          <span className={`scan-comparison-score ${getRiskClass(current.avg_risk_score)}`}>
            {toPercent(current.avg_risk_score)}
          </span>
          <span className="scan-comparison-date">{formatRelativeTime(current.timestamp)}</span>
          <span className={`scan-comparison-change ${change > 0 ? 'up' : change < 0 ? 'down' : ''}`}>
            {changeLabel}
          </span>
        </div>
        <div className="scan-comparison-history">
          <button
            type="button"
            className="button-secondary scan-comparison-history-btn"
            onClick={() => setSelectedScanResult(null)}
          >
            {'View full history ->'}
          </button>
        </div>
      </div>
    )
  }

  const renderMainContent = () => {
    if (activeView === 'analytics') {
      return (
        <section className="dashboard-page">
          <div className="dashboard-page-header dashboard-page-header-left">
            <p className="dashboard-page-label">Insights</p>
            <h1 className="dashboard-page-title">Analytics</h1>
            <p className="dashboard-page-description">
              Scan trends and plantation health summary - coming soon.
            </p>
          </div>
        </section>
      )
    }

    if (activeView === 'reports') {
      return (
        <section className="dashboard-page">
          <div className="dashboard-page-header dashboard-page-header-left">
            <p className="dashboard-page-label">History</p>
            <h1 className="dashboard-page-title">Reports</h1>
            <p className="dashboard-page-description">
              All past scan reports - coming soon.
            </p>
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
              {newLandId && !landNameSaved ? (
                <div className="new-land-banner">
                  <div className="new-land-banner-content">
                    <MapPinned size={16} />
                    <span>New plantation land detected at this location. Give it a name?</span>
                  </div>
                  <div className="new-land-banner-actions">
                    <input
                      className="new-land-banner-input"
                      type="text"
                      placeholder="e.g. Sabah North Block A"
                      value={landNameInput}
                      onChange={(e) => setLandNameInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveLandName()}
                      disabled={isSavingLandName}
                    />
                    <button
                      className="button-dark new-land-banner-save"
                      onClick={handleSaveLandName}
                      disabled={isSavingLandName || !landNameInput.trim()}
                    >
                      {isSavingLandName ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      className="button-secondary new-land-banner-skip"
                      onClick={() => setNewLandId(null)}
                      disabled={isSavingLandName}
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ) : null}

              <ScanComparisonBar scans={landScans} currentScanId={currentResult.history_id} />
              <SimpleResultsView result={currentResult} />
            </div>

            <aside className="analysis-results-chat">
              <div className="analysis-results-chat-inner">
                <AgentChat
                  result={currentResult}
                  prevScan={getPrevScan(landScans, currentResult?.history_id)}
                />
              </div>
            </aside>
          </div>
        </section>
      )
    }

    if (selectedScanResult && selectedLandId !== null) {
      return (
        <section className="dashboard-page">
          <div className="scan-result-topbar">
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setSelectedScanResult(null)
                setSelectedScanId(null)
              }}
            >
              {'<- Back to Land'}
            </button>
          </div>

          <ScanComparisonBar scans={landScans} currentScanId={selectedScanResult.history_id} />

          <div className="analysis-results-shell">
            <div className="analysis-results-main">
              <ScanComparisonBar scans={landScans} currentScanId={selectedScanResult.history_id} />
              <SimpleResultsView result={selectedScanResult} />
            </div>

            <aside className="analysis-results-chat">
              <div className="analysis-results-chat-inner">
                <AgentChat
                  result={selectedScanResult}
                  prevScan={getPrevScan(landScans, selectedScanResult?.history_id)}
                />
              </div>
            </aside>
          </div>
        </section>
      )
    }

    if (isAddingLand) {
      return (
        <section className="dashboard-page upload-page">
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
          <div className="land-detail-header">
            <button
              type="button"
              className="button-secondary land-detail-back"
              onClick={() => {
                setSelectedLandId(null)
                setSelectedScanId(null)
              }}
            >
              {'<- Back'}
            </button>

            <div className="land-detail-title-row">
              <div>
                <p className="dashboard-page-label">Plantation Land</p>
                <h1 className="dashboard-page-title">
                  {selectedLand?.name || 'Unnamed Land'}
                </h1>
              </div>

              <button
                type="button"
                className="button-dark land-detail-new-scan"
                onClick={() => {
                  setIsAddingLand(true)
                  setSelectedLandId(null)
                  setSelectedScanId(null)
                }}
              >
                <Plus size={16} />
                <span>New Scan</span>
              </button>
            </div>
          </div>

          {isLandScansLoading || isLoadingScan ? (
            <div className="land-scans-loading">
              <LoaderCircle className="history-loading-icon" />
              <p>{isLoadingScan ? 'Opening scan...' : 'Loading scans...'}</p>
            </div>
          ) : landScans.length === 0 ? (
            <div className="land-scans-empty">
              <p>No scans yet for this land.</p>
              <button
                type="button"
                className="button-dark land-detail-new-scan"
                onClick={() => {
                  setIsAddingLand(true)
                  setSelectedLandId(null)
                  setSelectedScanId(null)
                }}
              >
                <Plus size={16} />
                <span>Upload First Scan</span>
              </button>
            </div>
          ) : (
            <div className="land-scans-list">
              {landScans.map((scan, index) => {
                const riskScore = Number(scan.avg_risk_score ?? 0)
                const riskLabel = riskScore >= 0.66 ? 'High' : riskScore >= 0.33 ? 'Medium' : 'Low'
                const riskIcon = riskScore >= 0.66 ? '🔴' : riskScore >= 0.33 ? '🟡' : '🟢'
                const riskClass = riskScore >= 0.66 ? 'high' : riskScore >= 0.33 ? 'medium' : 'low'
                const scanNumber = landScans.length - index

                return (
                  <button
                    key={scan.id}
                    type="button"
                    className={`land-scan-card ${selectedScanId === scan.id ? 'active' : ''}`}
                    onClick={() => handleSelectScan(scan.id)}
                    disabled={isLoadingScan}
                  >
                    <div className="land-scan-card-left">
                      <span className="land-scan-number">{`Scan #${scanNumber}`}</span>
                      <span className="land-scan-title">{scan.title}</span>
                    </div>
                    <div className="land-scan-card-right">
                      <span className={`land-risk-badge ${riskClass}`}>
                        {riskIcon} {riskLabel}
                      </span>
                      <span className="land-scan-meta">
                        {scan.infected_count} infected · {formatRelativeTime(scan.timestamp)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
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
              <div
                key={land.id}
                className="land-card"
              >
                <div className="land-card-title-row">
                  <div className="land-card-title-wrap">
                    <button
                      type="button"
                      className="land-card-main"
                      onClick={() => setSelectedLandId(land.id)}
                    >
                      <MapPinned size={18} />
                      {renamingLandId === land.id ? (
                        <div className="land-rename-row" onClick={(e) => e.stopPropagation()}>
                          <input
                            className="land-rename-input"
                            value={renamingLandValue}
                            onChange={(e) => setRenamingLandValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleRenameLand(land.id)
                              if (e.key === 'Escape') {
                                setRenamingLandId(null)
                                setRenamingLandValue('')
                              }
                            }}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="button-dark land-rename-save"
                            onClick={() => handleRenameLand(land.id)}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            className="button-secondary land-rename-cancel"
                            onClick={() => {
                              setRenamingLandId(null)
                              setRenamingLandValue('')
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <span className={`land-card-title ${land.name ? '' : 'untitled'}`}>
                          {land.name || 'Unnamed Land'}
                        </span>
                      )}
                    </button>
                  </div>
                  <div className="land-card-actions">
                    <span className={`land-risk-badge ${riskMeta.className}`}>
                      {riskMeta.icon} {riskMeta.label}
                    </span>
                    <button
                      type="button"
                      className="land-menu-button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setLandMenuOpenId((current) => (current === land.id ? null : land.id))
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </button>

                    {landMenuOpenId === land.id ? (
                      <div className="land-context-menu" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="land-context-item"
                          onClick={() => {
                            setRenamingLandId(land.id)
                            setRenamingLandValue(land.name || '')
                            setLandMenuOpenId(null)
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="land-context-item danger"
                          onClick={() => {
                            setDeleteConfirmLandId(land.id)
                            setLandMenuOpenId(null)
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  className="land-card-main land-card-meta-button"
                  onClick={() => setSelectedLandId(land.id)}
                >
                  <div className="land-card-meta">
                  <span>{land.scan_count || 0} scans</span>
                  <span>Last scan: {formatRelativeTime(land.last_scan_at)}</span>
                  </div>
                </button>
              </div>
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
          <div className="sidebar-brand">
            <p className="sidebar-app-kicker">Palm Oil Disease Analytics</p>
            <div className="sidebar-app-name">PalmGuard AI</div>
          </div>

          <nav className="sidebar-nav">
            <button
              className={`sidebar-nav-item ${activeView === 'home' ? 'active' : ''}`}
              type="button"
              onClick={goHome}
            >
              <HomeIcon size={16} />
              <span>Home</span>
            </button>

            <button
              className={`sidebar-nav-item ${activeView === 'analytics' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveView('analytics')}
            >
              <BarChart2 size={16} />
              <span>Analytics</span>
            </button>

            <button
              className={`sidebar-nav-item ${activeView === 'reports' ? 'active' : ''}`}
              type="button"
              onClick={() => setActiveView('reports')}
            >
              <FileText size={16} />
              <span>Reports</span>
            </button>
          </nav>
        </div>

        <div className="sidebar-bottom-nav">
          <button className="sidebar-nav-item" type="button">
            <CreditCard size={16} />
            <span>Billing</span>
          </button>
          <button className="sidebar-nav-item" type="button">
            <User size={16} />
            <span>Account</span>
          </button>
          <button className="sidebar-nav-item" type="button">
            <HelpCircle size={16} />
            <span>Help &amp; Support</span>
          </button>
          <button
            className="sidebar-nav-item"
            type="button"
            onClick={() => setIsSettingsOpen(true)}
          >
            <Settings size={16} />
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

      {deleteConfirmLandId ? (
        <div className="settings-modal-backdrop" onClick={() => setDeleteConfirmLandId(null)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-body">
              <h2>Delete this land?</h2>
              <p>This will permanently delete the land and all its scan history. This cannot be undone.</p>
            </div>
            <div className="delete-modal-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => setDeleteConfirmLandId(null)}
                disabled={!!isDeletingLandId}
              >
                Cancel
              </button>
              <button
                className="button-dark delete-confirm-button"
                type="button"
                onClick={() => handleDeleteLand(deleteConfirmLandId)}
                disabled={!!isDeletingLandId}
              >
                {isDeletingLandId ? 'Deleting...' : 'Delete'}
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

