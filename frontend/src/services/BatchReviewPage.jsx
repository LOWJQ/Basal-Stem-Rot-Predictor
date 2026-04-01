import { useMemo, useRef, useState } from 'react'
import {
  CheckCircle,
  AlertTriangle,
  Images,
  LoaderCircle,
  MapPin,
  Trash2,
  PlayCircle,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { buildImageEntries } from './imageEntryUtils'

export default function BatchReviewPage({
  items,
  onAnalyzeAll,
  onBack,
  isLoading,
  progress,
  itemProgress = {},
  error,
}) {
  const [entries, setEntries] = useState(items)
  const [isAddingImages, setIsAddingImages] = useState(false)
  const fileInputRef = useRef(null)

  const updateField = (index, field, value) => {
    setEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    )
  }

  const removeEntry = (index) => {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }

  const openFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const handleAddImages = async (event) => {
    const fileList = event.target.files
    if (!fileList || fileList.length === 0) return

    setIsAddingImages(true)
    const nextEntries = await buildImageEntries(fileList)
    setEntries((current) => [...current, ...nextEntries])
    setIsAddingImages(false)
  }

  const isComplete = (entry) =>
    entry.lat !== '' && entry.lon !== '' && entry.altitude !== ''

  const completeCount = entries.filter(isComplete).length
  const canAnalyzeAll = completeCount > 0

  const buildFormData = (entry) => {
    const formData = new FormData()
    formData.append('image', entry.file)
    formData.append('lat', entry.lat)
    formData.append('lon', entry.lon)
    formData.append('altitude', entry.altitude)
    return formData
  }

  const handleAnalyzeAll = () => {
    const completeEntries = entries.filter(isComplete)
    onAnalyzeAll(completeEntries.map((entry) => ({
      id: entry.id,
      fileName: entry.file.name,
      formData: buildFormData(entry),
    })))
  }

  const visibleProgress = useMemo(
    () => entries.reduce((acc, entry) => {
      acc[entry.id] = itemProgress[entry.id] || 'idle'
      return acc
    }, {}),
    [entries, itemProgress]
  )

  if (entries.length === 0) {
    return (
      <div className="batch-review-empty">
        <p>No images to review.</p>
        <button className="composer-submit" onClick={onBack}>Go back</button>
      </div>
    )
  }

  return (
    <motion.div
      className="batch-review-page"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="batch-review-header">
        <div className="batch-review-header-left">
          <button className="batch-back-btn" onClick={onBack} disabled={isLoading}>
            ← Back
          </button>
          <div>
            <h2 className="batch-review-title">Review images</h2>
            <p className="batch-review-subtitle">
              {entries.length} image{entries.length !== 1 ? 's' : ''} selected
              {' · '}
              <span className={completeCount === 0 ? 'batch-count-warn' : 'batch-count-ok'}>
                {completeCount} with complete location
              </span>
            </p>
          </div>
        </div>

        <div className="batch-review-header-right">
          {!canAnalyzeAll && (
            <p className="batch-analyze-all-warning">
              <AlertTriangle size={13} />
              At least one image needs complete location data
            </p>
          )}

          <div className="batch-review-actions">
            <button
              type="button"
              className="batch-add-images-btn"
              onClick={openFilePicker}
              disabled={isLoading || isAddingImages}
            >
              <Images size={15} />
              {isAddingImages ? 'Adding...' : 'Add images'}
            </button>

            <button
              className="composer-submit batch-analyze-all-btn"
              onClick={handleAnalyzeAll}
              disabled={!canAnalyzeAll || isLoading || isAddingImages}
            >
              <PlayCircle size={15} />
              {isLoading ? 'Analyzing...' : `Analyze all (${completeCount})`}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            onChange={handleAddImages}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {error ? <p className="error-message">{error}</p> : null}

      <div className="batch-review-list">
        {entries.map((entry, index) => {
          const complete = isComplete(entry)
          const entryStatus = visibleProgress[entry.id]

          return (
            <motion.div
              key={entry.id}
              className={`batch-review-card ${complete ? 'complete' : 'incomplete'}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              {entryStatus === 'running' ? (
                <span className="batch-card-progress" aria-label={`Analyzing ${entry.file.name}`}>
                  <LoaderCircle size={18} className="batch-card-progress-icon spinning" />
                </span>
              ) : null}

              {entryStatus === 'done' ? (
                <span className="batch-card-progress done" aria-label={`${entry.file.name} complete`}>
                  <CheckCircle size={18} className="batch-card-progress-icon" />
                </span>
              ) : null}

              {entryStatus === 'error' ? (
                <span className="batch-card-progress error" aria-label={`${entry.file.name} failed`}>
                  <AlertTriangle size={18} className="batch-card-progress-icon" />
                </span>
              ) : null}

              <div className="batch-thumb-wrap">
                <img src={entry.preview} alt={entry.file.name} className="batch-thumb" />
                <span className={`batch-status-badge ${complete ? 'badge-ok' : 'badge-warn'}`}>
                  {complete
                    ? <><CheckCircle size={11} /> Ready</>
                    : <><AlertTriangle size={11} /> Incomplete</>
                  }
                </span>
              </div>

              <div className="batch-card-body">
                <div className="batch-file-name" title={entry.file.name}>
                  {entry.file.name}
                </div>
                {entry.exifFound
                  ? <p className="batch-exif-note exif-found">EXIF location extracted</p>
                  : <p className="batch-exif-note exif-missing">No EXIF data - enter manually</p>
                }

                <div className="batch-fields">
                  <div className="batch-field">
                    <label><MapPin size={12} /> Latitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={entry.lat}
                      onChange={(e) => updateField(index, 'lat', e.target.value)}
                      placeholder="e.g. 3.1390"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="batch-field">
                    <label><MapPin size={12} /> Longitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={entry.lon}
                      onChange={(e) => updateField(index, 'lon', e.target.value)}
                      placeholder="e.g. 101.6869"
                      disabled={isLoading}
                    />
                  </div>
                  <div className="batch-field">
                    <label>Altitude (m)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={entry.altitude}
                      onChange={(e) => updateField(index, 'altitude', e.target.value)}
                      placeholder="e.g. 50"
                      disabled={isLoading}
                    />
                  </div>
                  <button
                    className="batch-remove-btn"
                    onClick={() => removeEntry(index)}
                    disabled={isLoading}
                    title="Remove"
                    aria-label={`Remove ${entry.file.name}`}
                    type="button"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}
