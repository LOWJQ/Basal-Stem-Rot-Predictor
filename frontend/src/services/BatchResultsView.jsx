import { useEffect, useMemo, useState } from 'react'
import AgentChat from './AgentChat'
import SimpleResultsView from './SimpleResultsView'
import ReportPreviewView from './ReportPreviewView'

function getVisiblePages(currentPage, totalPages, maxVisible = 10) {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const half = Math.floor(maxVisible / 2)
  let start = Math.max(1, currentPage - half)
  let end = Math.min(totalPages, start + maxVisible - 1)

  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1)
  }

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

export default function BatchResultsView({
  results,
  selectedHistoryId,
  onSelectHistory,
}) {
  const [resultViewMode, setResultViewMode] = useState('analysis')
  const [reportOverrides, setReportOverrides] = useState({})

  const currentPage = useMemo(() => {
    const index = results.findIndex((item) => item.history_id === selectedHistoryId)
    return index >= 0 ? index + 1 : 1
  }, [results, selectedHistoryId])

  const totalPages = results.length
  const currentResult = results[currentPage - 1]
  const visiblePages = useMemo(
    () => getVisiblePages(currentPage, totalPages),
    [currentPage, totalPages]
  )

  const handleReportUpdate = (updatedReport) => {
    if (!currentResult?.history_id) return
    setReportOverrides((prev) => ({
      ...prev,
      [currentResult.history_id]: updatedReport,
    }))
  }

  const effectiveReport =
    reportOverrides[currentResult?.history_id] ?? currentResult?.report

  const scrollToPageTop = () => {
    const scrollingElement =
      document.scrollingElement || document.documentElement || document.body

    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    scrollingElement.scrollTop = 0
  }

  const switchResultViewMode = (mode) => {
    setResultViewMode(mode)
  }

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      scrollToPageTop()
    })

    return () => window.cancelAnimationFrame(rafId)
  }, [resultViewMode])

  useEffect(() => {
    setResultViewMode('analysis')
  }, [currentResult?.history_id])

  const goToPage = (page) => {
    const nextResult = results[page - 1]
    if (!nextResult) return
    onSelectHistory(nextResult.history_id)
  }

  const pagination = (
    <nav className="batch-pagination" aria-label="Batch results pagination">
      <button
        type="button"
        className="batch-pagination-link previous"
        onClick={() => goToPage(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
      >
        Previous
      </button>

      {visiblePages.map((page) => (
        <button
          key={page}
          type="button"
          className={`batch-pagination-link ${page === currentPage ? 'active' : ''}`}
          onClick={() => goToPage(page)}
          aria-current={page === currentPage ? 'page' : undefined}
        >
          {page}
        </button>
      ))}

      <button
        type="button"
        className="batch-pagination-link next"
        onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
      >
        Next
      </button>
    </nav>
  )

  return (
    <div className="batch-results-page dashboard-page">
      <div className="results-tabbar" role="tablist" aria-label="Result views">
        <button
          type="button"
          className={`results-tab ${resultViewMode === 'analysis' ? 'active' : ''}`}
          onClick={() => switchResultViewMode('analysis')}
          role="tab"
          aria-selected={resultViewMode === 'analysis'}
        >
          Analysis View
        </button>
        <button
          type="button"
          className={`results-tab ${resultViewMode === 'report' ? 'active' : ''}`}
          onClick={() => effectiveReport && switchResultViewMode('report')}
          role="tab"
          aria-selected={resultViewMode === 'report'}
          disabled={!effectiveReport}
        >
          Report Preview
        </button>
      </div>

      {resultViewMode === 'report' && effectiveReport ? (
        <>
          <ReportPreviewView report={effectiveReport} historyId={currentResult.history_id} />
          {pagination}
        </>
      ) : (
        <div className="analysis-results-shell">
          <div className="analysis-results-main">
            <SimpleResultsView result={currentResult} onReportUpdate={handleReportUpdate} />
            {pagination}
          </div>

          <aside className="analysis-results-chat">
            <div className="analysis-results-chat-inner">
              <AgentChat result={currentResult} />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
