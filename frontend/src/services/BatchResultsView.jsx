import { useEffect, useMemo, useState } from 'react'
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

  useEffect(() => {
    setResultViewMode('analysis')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentResult?.history_id])

  const goToPage = (page) => {
    const nextResult = results[page - 1]
    if (!nextResult) return
    onSelectHistory(nextResult.history_id)
  }

  return (
    <div className="batch-results-page">
      {effectiveReport ? (
        <div className="batch-results-toggle-wrap">
          <div className="result-view-toggle">
            <button
              type="button"
              className={`result-view-toggle-button ${resultViewMode === 'analysis' ? 'active' : ''}`}
              onClick={() => setResultViewMode('analysis')}
            >
              Analysis View
            </button>
            <button
              type="button"
              className={`result-view-toggle-button ${resultViewMode === 'report' ? 'active' : ''}`}
              onClick={() => setResultViewMode('report')}
            >
              Report Preview
            </button>
          </div>
        </div>
      ) : null}

      {resultViewMode === 'report' && effectiveReport
        ? <ReportPreviewView report={effectiveReport} historyId={currentResult.history_id} />
        : <SimpleResultsView result={currentResult} onReportUpdate={handleReportUpdate} />}

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
    </div>
  )
}
