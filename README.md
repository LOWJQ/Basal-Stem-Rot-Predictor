# Basal Stem Rot (BSR) Predictor

An AI-powered decision support system for early detection, risk assessment, and future spread simulation of Basal Stem Rot (BSR) in oil palm plantations.

## Problem Statement

Palm oil accounts for over 30% of global edible oil supply and is found in nearly 50% of packaged products, with about 68% used in food applications such as cooking oil, margarine, and instant noodles.

However, Basal Stem Rot (BSR), caused by *Ganoderma boninense*, is the most destructive disease affecting oil palm plantations and can reduce yields by up to 80%. This poses a significant threat to:
- Food supply stability  
- Commodity prices  
- Farmer livelihoods 

Malaysia is the world’s second-largest palm oil producer, and palm oil is one of the country’s most important export commodities. Despite its importance, current BSR management methods face several limitations:

- Manual plantation inspection is time-consuming and labor-intensive  
- Infection is often detected too late, only after visible symptoms appear  
- Lack of integrated digital platforms for large-scale monitoring and risk management  

As a result, farmers often respond only after the infection has spread, leading to severe production losses.

There is a clear need for an early-warning and predictive system to identify high-risk areas before large-scale outbreaks occur.

---

## Solution Overview

This project provides a full-stack AI system that converts plantation images into actionable insights:

1. Upload aerial or drone image  
2. Detect infected trees using computer vision  
3. Integrate environmental data  
4. Generate spatial risk heatmaps  
5. Simulate future disease spread  
6. Save, visualize, and export reports  

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

### 4. Create `.env` file
Inside the `backend` folder, create a file named `.env`:

```
backend/.env
```

Add your API keys:
```
OPENWEATHER_API_KEY=your_api_key
AGRO_API_KEY=your_api_key
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