## Installation Guidance

### Requirements
- Python **3.11 or above**
- pip

---

### 1. Clone the repository
```bash
git clone https://github.com/LOWJQ/Basal-Stem-Rot-Predictor
cd Basal-Stem-Rot-Predictor
```

---

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

---

### 3. Download model file
Download the detection model (`model1.pt`) and place it in:

```
backend/model/model1.pt
```

Here's the downloadable link:
```
https://drive.google.com/uc?export=download&id=1wbQr-HsI6B2-WJ47qt-7DNo4G2G0ti6c
```
---

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

---

### 5. Run the backend
```bash
cd backend
python main.py
```