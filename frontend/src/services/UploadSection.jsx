import { useRef, useState } from 'react'
import { Upload, Image as ImageIcon } from 'lucide-react'
import { buildImageEntries } from './imageEntryUtils'

export default function UploadSection({ onAnalyze, isLoading, error }) {
  const fileInputRef = useRef(null)
  const [dragActive, setDragActive] = useState(false)
  const [extracting, setExtracting] = useState(false)

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
    onAnalyze(entries[0])
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
