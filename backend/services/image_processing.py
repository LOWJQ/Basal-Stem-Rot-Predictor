from ultralytics import YOLO
from PIL import Image
import os

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model", "model1.pt")

model = None

def get_model():
    global model
    if model is None:
        if not os.path.exists(MODEL_PATH):
            raise FileNotFoundError(
                "Model not found. Please download model1.pt and place it in backend/model/"
            )
        try:
            model = YOLO(MODEL_PATH)
        except Exception as e:
            raise RuntimeError(f"Failed to load model: {str(e)}")
    return model

def detect_infected(image_path):
    try:
        img = Image.open(image_path).convert("RGB")
    except Exception:
        return []

    model = get_model()

    results = model(img)
    result = results[0]

    infected_points = []

    if result.boxes is None or len(result.boxes) == 0:
        return infected_points

    boxes = result.boxes.xyxy.tolist()
    confidences = result.boxes.conf.tolist()

    for box, conf in zip(boxes, confidences):
        x1, y1, x2, y2 = box

        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2

        infected_points.append({
            "x": cx,
            "y": cy,
            "conf": float(conf)
        })

    return infected_points