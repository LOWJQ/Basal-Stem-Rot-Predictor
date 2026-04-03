import { useRef, useState } from 'react'
import { Upload, Images } from 'lucide-react'
import { motion } from 'framer-motion'
import { buildImageEntries } from './imageEntryUtils'

export default function UploadSection({ onReview, isLoading, error }) {
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
    setExtracting(true)

    const entries = await buildImageEntries(fileList)

    setExtracting(false)

    if (entries.length === 0) return
    onReview(entries)
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files)
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files)
    }
  }

  const busy = isLoading || extracting

  return (
    <div className="upload-container">
      <motion.div
        className="composer-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div
          className={`composer-dropzone ${dragActive ? 'active' : ''} ${busy ? 'disabled' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={busy ? undefined : openFilePicker}
          style={{ cursor: busy ? 'not-allowed' : 'pointer' }}
        >
          <div className="composer-placeholder">
            {extracting ? (
              <>
                <span className="upload-extracting-spinner" />
                <span className="composer-main-text">Reading EXIF data...</span>
              </>
            ) : (
              <>
                <Upload size={22} className="upload-icon" />
                <div className="upload-text-block">
                  <span className="composer-main-text">
                    Drop images here or click to upload
                  </span>
                  <span className="upload-hint">
                    <Images size={12} />
                    Multiple images supported · JPEG or PNG · GPS extracted automatically
                  </span>
                </div>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            multiple
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>

        <div style={{ textAlign: 'center', marginTop: '12px' }}>

          <a href="https://drive.google.com/uc?export=download&id=1gj41lPXMzr0JjqIXjFu1Fnt7rxXVNgCt"
            style={{ fontSize: '15px', color: '#666', textDecoration: 'underline', cursor: 'pointer' }}
          >
            Don't have a drone image? Download a sample to try
          </a>
        </div>

        {error && <div className="error-message">{error}</div>}
      </motion.div>
    </div>
  )
}
