# Basal Stem Rot (BSR) Predictor

An AI-powered decision support system for early detection, risk assessment, and future spread simulation of Basal Stem Rot (BSR) in oil palm plantations.

## Problem Statement

Palm oil accounts for over **30%** of global edible oil supply and is found in nearly **50%** of packaged products, with about **68%** used in food applications such as cooking oil, margarine, and instant noodles.

However, Basal Stem Rot (BSR), caused by *Ganoderma boninense*, is the most destructive disease affecting oil palm plantations and can reduce yields by up to **80%**. This poses a significant threat to:
- Food security for millions who depend on palm oil as an affordable cooking staple.
- Food product prices  
- Farmer livelihoods 

Malaysia is the world's second-largest palm oil producer, and palm oil is one of the country's most important export commodities. Despite its importance, current BSR management methods face several limitations:

- Manual plantation inspection is time-consuming and labor-intensive  
- Infection is often detected too late, only after visible symptoms appear  
- Lack of integrated digital platforms for large-scale monitoring and risk management  

As a result, farmers often respond only after the infection has spread, leading to severe production losses.

There is a clear need for an early-warning and predictive system to identify high-risk areas before large-scale outbreaks occur.

---

## Solution Overview

This project provides a full-stack AI system that converts plantation images into actionable insights:

1. User upload drone image, GPS location and altitude of the drone  
2. Detect infected trees using computer vision  
3. Integrate live environmental data (temperature, humidity, soil moisture)
4. Generate a spatial risk heatmap across the plantation grid 
5. Simulate future disease spread up to 12 weeks ahead 
6. Save, visualize, and export reports as PDF or Excel

---

## Model Performance

Detection powered by a YOLOv8 model trained on labelled BSR drone imagery.
Validated on 104 held-out aerial images (126 BSR instances).

| Metric           | Score  |
|------------------|--------|
| mAP@0.5          | 0.75   |
| mAP@0.5-0.95     | 0.40   |
| Precision        | 0.72   |
| Recall           | 0.70   |
| Inference speed  | 5.8ms/image (Tesla T4) |

The pipeline is designed to improve as more plantation data is collected over time.

---

## Live Environmental Data

Risk assessment is enriched with real-time environmental data pulled from two external APIs:

| Data | Source | What it provides |
|------|--------|-----------------|
| Temperature & Humidity | [OpenWeatherMap API](https://openweathermap.org/api) | Live weather readings at GPS coordinates |
| Soil Moisture | [Agromonitoring API](https://agromonitoring.com) | Surface soil moisture at plantation location |

---

## Installation and Setup

### Requirements
- Python **3.11 or above**
- pip

### 1. Clone the repository
```bash
git clone https://github.com/LOWJQ/Basal-Stem-Rot-Predictor
cd Basal-Stem-Rot-Predictor
```

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Download model file
Download the detection model (`model1.pt`) and place it in:
```
backend/model/model1.pt
```

Here's the downloadable link:
```
https://drive.google.com/uc?export=download&id=1wbQr-HsI6B2-WJ47qt-7DNo4G2G0ti6c
```

#### (Optional) Train the model yourself

If you'd like to train the detection model on your own, the dataset used in this project is publicly available online:

**Dataset:** Ganoderma Detection Dataset for Oil Palm Crop Disease Classification  
**Link:** https://data.mendeley.com/datasets/s23jvbpnr3/1  
**Size:** ~1,000 labelled images of oil palm with Basal Stem Rot

### 4. Create `.env` file
Inside the `backend` folder, create a file named `.env`:
```
backend/.env
```

Add your API keys:
```
OPENWEATHER_API_KEY=your_api_key  # Get free key at openweathermap.org/api
AGRO_API_KEY=your_api_key         # Get free key at agromonitoring.com
```

### 5. Run the backend
```bash
cd backend
python main.py
```

### 6. Run the frontend
```bash
cd frontend
npm install
npm start
```
