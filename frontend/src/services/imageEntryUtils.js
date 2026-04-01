import exifr from 'exifr'

function readPreview(file) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.readAsDataURL(file)
  })
}

export async function buildImageEntries(fileList) {
  const imageFiles = Array.from(fileList).filter((file) =>
    file.type === 'image/jpeg' || file.type === 'image/png'
  )

  if (imageFiles.length === 0) return []

  const entries = await Promise.all(
    imageFiles.map(async (file, index) => {
      const preview = await readPreview(file)

      let lat = ''
      let lon = ''
      let altitude = ''
      let exifFound = false

      try {
        const gps = await exifr.gps(file)
        const tags = await exifr.parse(file, ['GPSAltitude'])

        if (gps && gps.latitude != null && gps.longitude != null) {
          lat = String(parseFloat(gps.latitude.toFixed(6)))
          lon = String(parseFloat(gps.longitude.toFixed(6)))
          exifFound = true
        }

        if (tags && tags.GPSAltitude != null) {
          altitude = String(parseFloat(tags.GPSAltitude.toFixed(1)))
        }
      } catch {
        // no EXIF - fields stay empty
      }

      return {
        id: `${file.name}-${file.lastModified}-${index}`,
        file,
        preview,
        lat,
        lon,
        altitude,
        exifFound,
      }
    })
  )

  return entries
}
