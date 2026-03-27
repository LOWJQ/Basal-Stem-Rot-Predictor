import { useRef, useState } from 'react'
import { Upload, MapPin, Image as ImageIcon } from 'lucide-react'
import { motion } from 'framer-motion'

export default function UploadSection({ onSubmit, isLoading, error }) {
  const fileInputRef = useRef(null)

  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [altitude, setAltitude] = useState('')
  const [dragActive, setDragActive] = useState(false)

  const openFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const handleFileChange = (selectedFile) => {
    if (selectedFile && selectedFile.type.startsWith('image/')) {
      setFile(selectedFile)
      const reader = new FileReader()
      reader.onloadend = () => setPreview(reader.result)
      reader.readAsDataURL(selectedFile)
    }
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0])
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!file) return

    const formData = new FormData()
    formData.append('image', file)
    formData.append('lat', latitude)
    formData.append('lon', longitude)
    formData.append('altitude', altitude)

    onSubmit(formData)
  }

  return (
    <div className="upload-container">
      <motion.div
        className="composer-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <form onSubmit={handleSubmit} className="composer-form">
          <div
            className={`composer-dropzone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={openFilePicker}
          >
            {preview ? (
              <div className="composer-preview">
                <img
                  src={preview}
                  alt="Selected preview"
                  className="composer-preview-image"
                />
                <button
                  type="button"
                  className="change-image-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    openFilePicker()
                  }}
                >
                  Replace
                </button>
              </div>
            ) : (
              <div className="composer-placeholder">
                <Upload size={22} className="upload-icon" />
                <span className="composer-main-text">Upload image</span>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => handleFileChange(e.target.files[0])}
              style={{ display: 'none' }}
            />
          </div>

          <div className="composer-grid">
            <div className="input-group compact">
              <label htmlFor="latitude">
                <MapPin size={15} />
                Latitude
              </label>
              <input
                id="latitude"
                type="number"
                step="0.0001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="e.g. 3.1390"
                required
              />
            </div>

            <div className="input-group compact">
              <label htmlFor="longitude">
                <MapPin size={15} />
                Longitude
              </label>
              <input
                id="longitude"
                type="number"
                step="0.0001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="e.g. 101.6869"
                required
              />
            </div>

            <div className="input-group compact composer-altitude">
              <label htmlFor="altitude">
                <ImageIcon size={15} />
                Drone height (m)
              </label>
              <input
                id="altitude"
                type="number"
                step="0.1"
                value={altitude}
                onChange={(e) => setAltitude(e.target.value)}
                placeholder="e.g. 50"
                required
              />
            </div>

            <button
              type="submit"
              className="composer-submit composer-submit-wide"
              disabled={!file || isLoading}
            >
              {isLoading ? 'Processing...' : 'Analyze'}
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}
        </form>
      </motion.div>
    </div>
  )
}
