import { useRef, useState } from 'react'
import { Upload, Image as ImageIcon } from 'lucide-react'
import { buildImageEntries } from './imageEntryUtils'

export default function UploadSection({ onAnalyze, isLoading, error }) {
  const fileInputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [pendingEntry, setPendingEntry] = useState(null)

  const openFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const processFiles = async (fileList) => {
    const firstFile = Array.from(fileList || []).find((file) => (
      file.type === 'image/jpeg' || file.type === 'image/png'
    ))

    if (!firstFile) return

    setExtracting(true)
    const entries = await buildImageEntries([firstFile])
    setExtracting(false)

    if (!entries.length) return
    setPendingEntry(entries[0])
  }

  const handleFileChange = (event) => {
    if (event.target.files && event.target.files.length > 0) {
      processFiles(event.target.files)
    }
  }

  const handleDrag = (event) => {
    event.preventDefault()
    event.stopPropagation()

    if (event.type === 'dragenter' || event.type === 'dragover') {
      setDragActive(true)
    } else if (event.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      processFiles(event.dataTransfer.files)
    }
  }

  const busy = isLoading || extracting

  if (pendingEntry) {
    return (
      <div className="upload-container">
        <div className="upload-shell">
          <div className="exif-confirm-card">
            <p className="exif-confirm-label">Image ready for analysis</p>
            <p className="exif-confirm-filename">{pendingEntry.file.name}</p>

            <div className="exif-confirm-preview">
              <img
                src={pendingEntry.preview}
                alt={pendingEntry.file.name}
                className="exif-confirm-preview-img"
              />
            </div>

            <div className="exif-confirm-fields">
              <div className="exif-field">
                <label>Latitude</label>
                <input
                  type="text"
                  value={pendingEntry.lat ?? ''}
                  onChange={(e) => setPendingEntry({ ...pendingEntry, lat: e.target.value })}
                  placeholder="Not detected"
                />
              </div>
              <div className="exif-field">
                <label>Longitude</label>
                <input
                  type="text"
                  value={pendingEntry.lon ?? ''}
                  onChange={(e) => setPendingEntry({ ...pendingEntry, lon: e.target.value })}
                  placeholder="Not detected"
                />
              </div>
              <div className="exif-field">
                <label>Altitude (m)</label>
                <input
                  type="text"
                  value={pendingEntry.altitude ?? ''}
                  onChange={(e) => setPendingEntry({ ...pendingEntry, altitude: e.target.value })}
                  placeholder="Not detected"
                />
              </div>
            </div>

            {pendingEntry.exifFound ? (
              <p className="exif-confirm-note">
                GPS data extracted from image. You may edit if needed.
              </p>
            ) : (
              <p className="exif-confirm-note warn">
                No GPS data found. You may enter coordinates manually.
              </p>
            )}

            <div className="exif-confirm-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => setPendingEntry(null)}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                className="button-dark exif-confirm-submit"
                type="button"
                onClick={() => onAnalyze(pendingEntry)}
                disabled={isLoading}
              >
                {isLoading ? 'Analysing...' : 'Run Analysis'}
              </button>
            </div>
          </div>

          {error ? <div className="error-message">{error}</div> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="upload-container">
      <div className="upload-shell">
        <div
          className={`composer-dropzone ${dragActive ? 'active' : ''} ${busy ? 'disabled' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={busy ? undefined : openFilePicker}
        >
          <div className="composer-placeholder">
            {extracting ? (
              <>
                <span className="upload-extracting-spinner" />
                <span className="composer-main-text">Reading EXIF data...</span>
              </>
            ) : (
              <>
                <Upload size={26} className="upload-icon" />
                <div className="upload-text-block">
                  <span className="composer-main-text">Drop an image here or click to upload</span>
                  <span className="upload-hint">
                    <ImageIcon size={12} />
                    Single image supported - JPEG or PNG - GPS extracted automatically
                  </span>
                </div>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        <div className="upload-sample-link-wrap">
          <a
            className="upload-sample-link"
            href="https://drive.google.com/uc?export=download&id=1gj41lPXMzr0JjqIXjFu1Fnt7rxXVNgCt"
          >
            Don&apos;t have a drone image? Download a sample to try
          </a>
        </div>

        {error ? <div className="error-message">{error}</div> : null}
      </div>
    </div>
  )
}
