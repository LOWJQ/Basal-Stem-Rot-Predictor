import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Rectangle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const RISK_COLORS = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#22c55e'
}

function ResizeMap() {
  const map = useMap()

  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize()
    }, 100)
  }, [map])

  return null
}

function GridOverlay({ cells, selectedCell, onCellClick }) {
  const map = useMap()

  useEffect(() => {
    if (cells.length > 0) {
      const lats = cells.map(c => c.lat)
      const lons = cells.map(c => c.lon)
      const bounds = [
        [Math.min(...lats) - 0.0005, Math.min(...lons) - 0.0005],
        [Math.max(...lats) + 0.0005, Math.max(...lons) + 0.0005]
      ]
      map.fitBounds(bounds)
    }
  }, [cells, map])

  const cellSize = 0.0001

  return (
    <>
      {cells.map((cell, index) => {
        const isSelected = selectedCell?.x === cell.x && selectedCell?.y === cell.y

        const bounds = [
          [cell.lat - cellSize, cell.lon - cellSize],
          [cell.lat + cellSize, cell.lon + cellSize]
        ]

        return (
          <Rectangle
            key={index}
            bounds={bounds}
            pathOptions={{
              color: RISK_COLORS[cell.risk],
              fillColor: RISK_COLORS[cell.risk],
              fillOpacity: isSelected ? 0.7 : 0.4,
              weight: isSelected ? 3 : 1
            }}
            eventHandlers={{
              click: () => onCellClick(cell)
            }}
          />
        )
      })}
    </>
  )
}

export default function HeatmapMap({ data, onCellClick }) {
  const [selectedCell, setSelectedCell] = useState(null)

  const handleCellClick = (cell) => {
    setSelectedCell(cell)
    onCellClick(cell)
  }

  if (!data || !data.heatmap || data.heatmap.length === 0) {
    return <div className="map-placeholder">No data available</div>
  }

  const center = [data.heatmap[0].lat, data.heatmap[0].lon]

  return (
    <div className="map-container">
      <MapContainer
        center={center}
        zoom={18}
        style={{ height: '100%', width: '100%', borderRadius: '12px' }}
        scrollWheelZoom={true}
      >
        <ResizeMap />
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <GridOverlay
          cells={data.heatmap}
          selectedCell={selectedCell}
          onCellClick={handleCellClick}
        />
      </MapContainer>
    </div>
  )
}