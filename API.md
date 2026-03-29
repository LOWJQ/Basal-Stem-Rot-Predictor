# BSR Prediction Website — API Reference

Base URL: `http://127.0.0.1:5000` (local) 

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/predict` | Upload drone image and get risk analysis |
| GET | `/history` | Get list of past scans |
| GET | `/health` | Check server and model status |
| GET | `/outputs/<filename>` | Serve output images |

---

## POST `/predict`

Main endpoint. Upload a drone image with GPS coordinates and get back a full risk heatmap, environmental data, and 11-week spread simulation.

### Request

Content-Type: `multipart/form-data`

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `image` | file | ✅ Yes | — | JPEG or PNG drone image |
| `lat` | float | No | `3.1390` | Latitude of image center |
| `lon` | float | No | `101.6869` | Longitude of image center |
| `altitude` | float | No | `50` | Drone altitude in meters |

**Example (curl):**
```bash
curl -X POST http://127.0.0.1:5000/predict \
  -F "image=@/path/to/drone.jpg" \
  -F "lat=3.139" \
  -F "lon=101.686" \
  -F "altitude=50"
```

**Example (JavaScript fetch):**
```javascript
const formData = new FormData()
formData.append('image', file)          
formData.append('lat', '3.139')
formData.append('lon', '101.686')
formData.append('altitude', '50')

const res = await fetch('http://127.0.0.1:5000/predict', {
  method: 'POST',
  body: formData
})
const data = await res.json()
```

---

### Response — Success `200`

```json
{
  "status": "success",
  "data": {
    "id": "abc123def456",
    "image_size": {
      "width": 1920,
      "height": 1080
    },
    "output_image": "http://127.0.0.1:5000/outputs/output_abc123.jpg",
    "infected_points": [
      { "x": 340.5, "y": 210.3, "conf": 0.87 },
      { "x": 780.1, "y": 540.6, "conf": 0.73 }
    ],
    "environment_summary": {
      "sampled_points": 7,
      "avg_temperature": 29.4,
      "avg_humidity": 83.2,
      "avg_soil_moisture": 0.224
    },
    "heatmap": [...],
    "heatmap_grid": [...],
    "grid_coordinates": [...],
    "simulation_frames": [
      "http://127.0.0.1:5000/outputs/frames/frame_0_abc.jpg",
      "http://127.0.0.1:5000/outputs/frames/frame_1_abc.jpg"
    ]
  }
}
```

---

### `heatmap` — flat list of 36 cells (6×6 grid)

Use this for rendering the grid overlay. Each object is one cell.

```json
[
  {
    "x": 0,
    "y": 0,
    "lat": 3.1392,
    "lon": 101.6867,
    "risk": "high",
    "risk_score": 0.821,
    "detected_infected_trees": 2,
    "infection_nearby": true,
    "factors": {
      "temperature (°C)": 29.4,
      "humidity (%)": 85.1,
      "soil_moisture (m³/m³)": 0.231
    },
    "explanation": {
      "reasons": [
        "High soil moisture promotes fungal growth",
        "Infection detected within nearby area",
        "High humidity favors disease spread"
      ],
      "actions": [
        "Apply fungicide treatment",
        "Remove or isolate infected trees immediately",
        "Improve drainage in the plantation"
      ]
    }
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `x` | int | Column index (0–5, left to right) |
| `y` | int | Row index (0–5, top to bottom) |
| `lat` / `lon` | float | Real-world GPS coordinate of cell center |
| `risk` | string | `"high"` / `"medium"` / `"low"` |
| `risk_score` | float | 0.0 – 1.0 (higher = more dangerous) |
| `detected_infected_trees` | int | Number of YOLO-detected infected trees in this cell |
| `infection_nearby` | bool | True if an infected tree is within 100px of cell center |
| `factors` | object | Live environmental readings for this cell |
| `explanation.reasons` | array | Why this risk level was assigned |
| `explanation.actions` | array | Recommended actions for this cell |

---

### `heatmap_grid` — 2D array [row][col]

Same data as `heatmap` but structured as a 6×6 nested array. Use this if you need to access a specific cell by row and column directly.

```json
[
  [ {cell_0_0}, {cell_0_1}, {cell_0_2}, {cell_0_3}, {cell_0_4}, {cell_0_5} ],
  [ {cell_1_0}, ... ],
  ...
]
```

Access: `heatmap_grid[row][col]` — same fields as `heatmap` above.

---

### `simulation_frames` — array of 13 image URLs

Pre-rendered heatmap overlay images for the spread simulation timeline.

```json
[
  "http://127.0.0.1:5000/outputs/frames/frame_0_abc.jpg",  // index 0 = Now
  "http://127.0.0.1:5000/outputs/frames/frame_1_abc.jpg",  // index 1 = Week 1
  "http://127.0.0.1:5000/outputs/frames/frame_2_abc.jpg",  // index 2 = Week 2
  ...
  "http://127.0.0.1:5000/outputs/frames/frame_12_abc.jpg"  // index 12 = Week 12
]
```

**For the simulation slider:**
```javascript
// week = 0 means "Now", week = 1-12 means Week N
const imageUrl = week === 0
  ? data.output_image                        // original annotated image
  : data.simulation_frames[week - 1]        // simulation frame
```

---

### `infected_points` — array of detected infection coords

Raw YOLO detection output. Coordinates are in image pixels.

```json
[
  { "x": 340.5, "y": 210.3, "conf": 0.87 },
  { "x": 780.1, "y": 540.6, "conf": 0.73 }
]
```

Use these to draw infection markers on top of the image if needed.

---

### Response — Errors

All errors follow this shape:

```json
{ "error": "Error message here" }
```

| Status | Error Message | Cause |
|--------|--------------|-------|
| `400` | `"No image uploaded"` | Missing image field |
| `400` | `"Invalid image type"` | Not JPEG or PNG |
| `400` | `"Corrupted image file"` | File is damaged |
| `400` | `"Invalid latitude/longitude"` | lat/lon cannot be parsed as float |
| `400` | `"Invalid altitude"` | altitude cannot be parsed as float |
| `400` | `"Failed to process image"` | Heatmap generation failed |
| `413` | `"File too large. Max 10MB allowed."` | Image exceeds 10MB |
| `500` | `"An internal error occurred. Please try again."` | Unhandled server error |

---

## GET `/history`

Returns the last 20 scans saved to the database, newest first.

### Request
No parameters required.

```bash
curl http://127.0.0.1:5000/history
```

### Response — Success `200`

```json
{
  "scans": [
    {
      "id": 1,
      "timestamp": "2026-03-26T07:00:00.000000",
      "lat": 3.139,
      "lon": 101.686,
      "altitude": 50.0,
      "infected_count": 4,
      "avg_risk_score": 0.612,
      "high_cells": 8,
      "medium_cells": 14,
      "low_cells": 14,
      "env_summary": "{\"avg_soil_moisture\": 0.224, \"avg_humidity\": 83.2, \"avg_temperature\": 29.4}"
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique scan ID |
| `timestamp` | string | UTC time of scan (ISO 8601) |
| `lat` / `lon` | float | GPS coordinates used |
| `altitude` | float | Drone altitude in meters |
| `infected_count` | int | Total infected trees detected |
| `avg_risk_score` | float | Average risk score across all 36 cells |
| `high_cells` | int | Number of high risk cells |
| `medium_cells` | int | Number of medium risk cells |
| `low_cells` | int | Number of low risk cells |
| `env_summary` | string | JSON string — parse with `JSON.parse()` |

**Note:** `env_summary` is a JSON string. Parse it on the frontend:
```javascript
const env = JSON.parse(scan.env_summary)
// { avg_soil_moisture: 0.224, avg_humidity: 83.2, avg_temperature: 29.4 }
```

---

## GET `/health`

Check if the server, YOLO model, and API keys are ready.

### Request
```bash
curl http://127.0.0.1:5000/health
```

### Response — Success `200`
```json
{
  "status": "ok",
  "uptime_seconds": 142,
  "model_loaded": true,
  "api_keys_present": {
    "openweather": true,
    "agro": true
  }
}
```

Use this on app load to check if the backend is ready before showing the upload UI. If `model_loaded` is false, the predict endpoint will fail.

---

## GET `/outputs/<filename>`

Serves generated output images. URLs are returned directly in the `/predict` response — you don't need to construct these manually.

```
GET /outputs/output_abc123.jpg          → main annotated image
GET /outputs/frames/frame_0_abc.jpg     → simulation frame
```

---

## Notes for Frontend

**CORS** is enabled for all origins — no proxy needed during development.

**Image loading** — simulation frames are generated server-side and may take 3–8 seconds total for the full predict request. Show a loading state while waiting.

**Recommended frontend flow:**
```
1. Call GET /health on app load
   → if model_loaded is false, show a warning
2. User uploads image + coordinates → POST /predict
   → show loading spinner
   → on success, render heatmap grid + output_image
3. User clicks a cell → show that cell's explanation from heatmap[]
4. User drags slider → swap image using simulation_frames[]
5. Sidebar calls GET /history on load → show past scans list
```

**Risk colour mapping (suggested):**
```javascript
const riskColour = {
  high:   '#ef4444',  // red
  medium: '#f97316',  // orange
  low:    '#22c55e',  // green
}
```
