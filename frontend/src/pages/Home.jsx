import { useEffect, useState } from 'react'
import {
  LoaderCircle,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Trash2,
} from 'lucide-react'
import UploadSection from '../services/UploadSection'
import BatchReviewPage from '../services/BatchReviewPage'
import BatchResultsView from '../services/BatchResultsView'
import {
  deleteAllHistoryScans,
  deleteHistoryScan,
  fetchHistory,
  fetchHistoryReport,
  fetchHistoryScan,
  predictScan,
} from '../services/api'

const HISTORY_BATCH_STORAGE_KEY = 'bsr-history-batches'
const LOCAL_MAX_CONCURRENT_ANALYSES = 7
const DEPLOYED_MAX_CONCURRENT_ANALYSES = 3

function readStoredHistoryBatches() {
  try {
    const stored = window.localStorage.getItem(HISTORY_BATCH_STORAGE_KEY)
    if (!stored) return []

    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredHistoryBatches(batches) {
  window.localStorage.setItem(HISTORY_BATCH_STORAGE_KEY, JSON.stringify(batches))
}

function createHistoryBatch(scanIds) {
  const existingBatches = readStoredHistoryBatches()
  const nextNumber = existingBatches.reduce((maxNumber, batch) => {
    const match = /^Scan history (\d+)$/.exec(batch.label || '')
    return match ? Math.max(maxNumber, Number(match[1])) : maxNumber
  }, 0) + 1

  const nextBatch = {
    id: `batch-${Date.now()}`,
    label: `Scan history ${nextNumber}`,
    createdAt: new Date().toISOString(),
    scanIds,
  }

  writeStoredHistoryBatches([nextBatch, ...existingBatches])
  return nextBatch
}

function buildHistoryGroups(historyItems) {
  const itemsById = new Map(historyItems.map((item) => [item.id, item]))
  const matchedIds = new Set()

  const groups = readStoredHistoryBatches()
    .map((batch) => {
      const scanIds = (batch.scanIds || []).filter((scanId) => itemsById.has(scanId))
      scanIds.forEach((scanId) => matchedIds.add(scanId))

      if (!scanIds.length) return null

      return {
        ...batch,
        scanIds,
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  const unmatchedItems = historyItems.filter((item) => !matchedIds.has(item.id))
  if (unmatchedItems.length) {
    groups.push({
      id: 'legacy-history',
      label: 'Scan history',
      createdAt: unmatchedItems[0].timestamp,
      scanIds: unmatchedItems.map((item) => item.id),
    })
  }

  return groups
}

async function runWithConcurrencyLimit(items, limit, worker) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function runner() {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (currentIndex >= items.length) {
        return
      }

      try {
        results[currentIndex] = {
          status: 'fulfilled',
          value: await worker(items[currentIndex], currentIndex),
        }
      } catch (error) {
        results[currentIndex] = {
          status: 'rejected',
          reason: error,
        }
      }
    }
  }

  const runnerCount = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: runnerCount }, () => runner()))
  return results
}

function getMaxConcurrentAnalyses() {
  if (typeof window === 'undefined') {
    return DEPLOYED_MAX_CONCURRENT_ANALYSES
  }

  const hostname = window.location.hostname
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1'

  return isLocalhost
    ? LOCAL_MAX_CONCURRENT_ANALYSES
    : DEPLOYED_MAX_CONCURRENT_ANALYSES
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [isOpeningHistory, setIsOpeningHistory] = useState(false)
  const [error, setError] = useState('')
  const [historyError, setHistoryError] = useState('')
  const [historyItems, setHistoryItems] = useState([])
  const [historyGroups, setHistoryGroups] = useState([])
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDeletingAllHistory, setIsDeletingAllHistory] = useState(false)
  const [historyActionLoadingId, setHistoryActionLoadingId] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [isDeleteAllConfirmOpen, setIsDeleteAllConfirmOpen] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [reviewItems, setReviewItems] = useState(null)
  const [batchResults, setBatchResults] = useState(null)
  const [selectedBatchHistoryId, setSelectedBatchHistoryId] = useState(null)
  const [selectedHistoryGroupId, setSelectedHistoryGroupId] = useState(null)
  const [batchProgress, setBatchProgress] = useState(null)
  const [batchItemProgress, setBatchItemProgress] = useState({})

  const loadHistory = async () => {
    try {
      setIsHistoryLoading(true)
      setHistoryError('')
      const response = await fetchHistory()
      const scans = response.scans || []
      setHistoryItems(scans)
      setHistoryGroups(buildHistoryGroups(scans))
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

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 900) {
        setIsMobileSidebarOpen(false)
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const loadBatchHistory = async (groupId = null, preferredHistoryId = null) => {
    const historyResponse = await fetchHistory()
    const scans = historyResponse.scans || []
    const groups = buildHistoryGroups(scans)

    setHistoryItems(scans)
    setHistoryGroups(groups)

    if (!scans.length) {
      setBatchResults(null)
      setSelectedBatchHistoryId(null)
      setSelectedHistoryGroupId(null)
      return []
    }

    const selectedGroup = groups.find((group) => group.id === groupId) || groups[0]
    if (!selectedGroup) {
      setBatchResults(null)
      setSelectedBatchHistoryId(null)
      setSelectedHistoryGroupId(null)
      return []
    }

    setSelectedHistoryGroupId(selectedGroup.id)

    const results = await Promise.all(
      selectedGroup.scanIds.map(async (scanId) => {
        const scan = scans.find((item) => item.id === scanId)
        if (!scan) return null

        const detailResponse = await fetchHistoryScan(scan.id)
        const detail = { ...detailResponse.scan }

        if (detail.payload && !detail.payload.report) {
          try {
            const reportResponse = await fetchHistoryReport(scan.id)
            detail.payload = { ...detail.payload, report: reportResponse.report }
          } catch {
            // Older scans may not have report data yet, so leave payload as-is.
          }
        }

        if (!detail.payload) {
          return null
        }

        return {
          ...detail.payload,
          history_id: detail.id,
          title: detail.title,
          timestamp: detail.timestamp,
        }
      })
    )

    const availableResults = results.filter(Boolean)
    setBatchResults(availableResults)

    const preferredExists = availableResults.some((item) => item.history_id === preferredHistoryId)
    setSelectedBatchHistoryId(
      preferredExists ? preferredHistoryId : availableResults[0]?.history_id ?? null
    )

    return availableResults
  }

  const resetToNewAnalysis = () => {
    setBatchResults(null)
    setSelectedBatchHistoryId(null)
    setSelectedHistoryGroupId(null)
    setReviewItems(null)
    setError('')
    setIsLoading(false)
    setIsOpeningHistory(false)
    setBatchProgress(null)
    setBatchItemProgress({})
    setOpenMenuId(null)
    setIsMobileSidebarOpen(false)
  }

  const runScan = async (formData) => {
    const response = await predictScan(formData)
    return response.data
  }

  const handleAnalyzeAll = async (batchItems) => {
    try {
      setIsLoading(true)
      setError('')
      setBatchResults(null)
      setSelectedBatchHistoryId(null)
      setBatchItemProgress(
        batchItems.reduce((acc, item) => {
          acc[item.id] = 'running'
          return acc
        }, {})
      )
      setBatchProgress({
        current: 0,
        total: batchItems.length,
        status: 'running',
        currentLabel: 'Starting all analyses...',
      })

      let settledCount = 0
      const settledResults = await runWithConcurrencyLimit(
        batchItems,
        getMaxConcurrentAnalyses(),
        async (item) => {
          const batchResult = await runScan(item.formData)
          settledCount += 1
          setBatchItemProgress((current) => ({ ...current, [item.id]: 'done' }))
          setBatchProgress({
            current: settledCount,
            total: batchItems.length,
            status: 'running',
            currentLabel: item.fileName
              ? `Finished ${item.fileName}`
              : `Finished item ${settledCount}`,
          })
          return batchResult
        }
      )

      const successfulResults = []
      const failedResults = []

      settledResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successfulResults.push(result.value)
          return
        }

        failedResults.push(result.reason)
        settledCount += 1
        setBatchItemProgress((current) => ({ ...current, [batchItems[index].id]: 'error' }))
        setBatchProgress({
          current: settledCount,
          total: batchItems.length,
          status: 'running',
          currentLabel: batchItems[index].fileName
            ? `Failed ${batchItems[index].fileName}`
            : `Failed item ${settledCount}`,
        })
      })

      if (successfulResults.length) {
        const nextBatch = createHistoryBatch(successfulResults.map((result) => result.history_id))
        setSelectedHistoryGroupId(nextBatch.id)
        await loadHistory()
      }

      if (!failedResults.length) {
        setReviewItems(null)
        setBatchResults(successfulResults)
        setSelectedBatchHistoryId(successfulResults[0]?.history_id ?? null)
        setBatchProgress({
          current: successfulResults.length,
          total: batchItems.length,
          status: 'done',
          currentLabel: 'Batch analysis complete',
        })
        return
      }

      const firstError = failedResults[0]
      const fallbackMessage = failedResults.length === batchItems.length
        ? 'Analysis failed. Try again with fewer images or retry in a moment.'
        : `${failedResults.length} image(s) failed. Successful analyses were saved to history.`

      setError(firstError?.message || fallbackMessage)
      setBatchProgress({
        current: successfulResults.length,
        total: batchItems.length,
        status: 'error',
        currentLabel: fallbackMessage,
      })
    } catch (err) {
      setError(err.message || 'Analysis failed. Please try again.')
      setBatchProgress((current) => current ? { ...current, status: 'error' } : null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleOpenHistory = async (groupId, preferredHistoryId = null) => {
    try {
      setIsOpeningHistory(true)
      setError('')
      setReviewItems(null)
      setBatchProgress(null)

      await loadBatchHistory(groupId, preferredHistoryId)
      setIsMobileSidebarOpen(false)
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

      setBatchResults(null)
      setSelectedBatchHistoryId(null)
      setSelectedHistoryGroupId(null)
      writeStoredHistoryBatches([])
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

  const handleToggleMenu = (event, groupId) => {
    event.stopPropagation()
    setOpenMenuId((current) => (current === groupId ? null : groupId))
  }

  const handleRequestDeleteHistoryGroup = (event, group) => {
    event.stopPropagation()
    setOpenMenuId(null)
    setDeleteTarget(group)
  }

  const handleConfirmDeleteHistoryGroup = async () => {
    if (!deleteTarget) return

    try {
      setHistoryActionLoadingId(deleteTarget.id)
      await Promise.all(deleteTarget.scanIds.map((scanId) => deleteHistoryScan(scanId)))

      writeStoredHistoryBatches(
        readStoredHistoryBatches().filter((batch) => batch.id !== deleteTarget.id)
      )

      await loadHistory()

      if (selectedHistoryGroupId === deleteTarget.id) {
        setBatchResults(null)
        setSelectedBatchHistoryId(null)
        setSelectedHistoryGroupId(null)
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
        <div className="history-loading-panel">
          <LoaderCircle className="history-loading-icon" />
          <p>Opening saved analysis...</p>
        </div>
      )
    }

    if (batchResults?.length) {
      return (
        <BatchResultsView
          results={batchResults}
          selectedHistoryId={selectedBatchHistoryId}
          onSelectHistory={setSelectedBatchHistoryId}
        />
      )
    }

    if (reviewItems) {
      return (
        <BatchReviewPage
          items={reviewItems}
          onAnalyzeAll={handleAnalyzeAll}
          onBack={resetToNewAnalysis}
          isLoading={isLoading}
          progress={batchProgress}
          itemProgress={batchItemProgress}
          error={error}
        />
      )
    }

    return (
      <>
        <p className="hero-kicker">Palm oil disease analysis</p>
        <h1 className="hero-title">From detection to decision in one scan</h1>
        <p className="hero-subtitle">
          <span>Upload images to generate a risk map.</span>
          <span>GPS coordinates are read automatically from image EXIF data.</span>
        </p>
        <div className="hero-trust-row">
          <span className="hero-trust-pill">AI-powered prediction</span>
          <span className="hero-trust-text">
            YOLO-V8-based infected tree detection combined with live environmental data
          </span>
        </div>
        <UploadSection
          onReview={setReviewItems}
          isLoading={isLoading}
          error={error}
        />
      </>
    )
  }

  return (
    <div className="app-layout">
      <aside className={`sidebar ${isMobileSidebarOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-top">
          <button className="sidebar-new" onClick={resetToNewAnalysis}>
            <span>New analysis</span>
          </button>

          <div className="sidebar-section">
            <div className="sidebar-label">Recent</div>

            <div className="sidebar-list">
              {isHistoryLoading ? (
                <div className="sidebar-state">Loading history...</div>
              ) : historyGroups.length ? (
                historyGroups.map((group) => (
                  <div
                    key={group.id}
                    className={`sidebar-history-row combined ${selectedHistoryGroupId === group.id ? 'active' : ''} ${openMenuId === group.id ? 'menu-open' : ''}`}
                  >
                    <button
                      className={`sidebar-item sidebar-item-main ${selectedHistoryGroupId === group.id ? 'active' : ''}`}
                      onClick={() => handleOpenHistory(group.id)}
                      disabled={isOpeningHistory || historyActionLoadingId === group.id}
                    >
                      <MessageSquare size={15} />
                      <span>{group.label} ({group.scanIds.length})</span>
                    </button>

                    <div className="sidebar-item-actions">
                      <button
                        type="button"
                        className="sidebar-icon-button menu-trigger"
                        onClick={(e) => handleToggleMenu(e, group.id)}
                        disabled={historyActionLoadingId === group.id}
                      >
                        <MoreHorizontal size={14} />
                      </button>

                      {openMenuId === group.id ? (
                        <div
                          className="sidebar-context-menu"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="sidebar-context-item danger"
                            onClick={(e) => handleRequestDeleteHistoryGroup(e, group)}
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

      {isMobileSidebarOpen ? (
        <button
          type="button"
          className="sidebar-mobile-backdrop"
          aria-label="Close sidebar"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      ) : null}

      <div className="main-panel">
        <header className="topbar">
          <button
            type="button"
            className="mobile-sidebar-toggle"
            onClick={() => setIsMobileSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <Menu size={18} />
          </button>
          <div className="brand">PalmGuard AI</div>
        </header>

        <main className="hero-layout">
          <div className="hero-content">
            {renderMainContent()}
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
                This will delete <strong>{deleteTarget.label}</strong> and its {deleteTarget.scanIds.length} saved result{deleteTarget.scanIds.length !== 1 ? 's' : ''}.
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
                onClick={handleConfirmDeleteHistoryGroup}
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
                className="delete-cancel-button"
                onClick={() => setIsDeleteAllConfirmOpen(false)}
                disabled={isDeletingAllHistory}
              >
                Cancel
              </button>

              <button
                type="button"
                className="delete-confirm-button"
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
