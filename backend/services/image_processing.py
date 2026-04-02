from ultralytics import YOLO
from PIL import Image
import os
import threading

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model", "model1.pt")

_model_lock = threading.Lock()
_inference_lock = threading.Lock()
model = None


def get_model():
    global model
    with _model_lock:
        if model is None:
            if not os.path.exists(MODEL_PATH):
                raise FileNotFoundError("Model not found. Place model1.pt in backend/model/")
            model = YOLO(MODEL_PATH)
    return model


def detect_infected(image_path):
    try:
        img = Image.open(image_path).convert("RGB")
    except Exception:
        return []

    MAX_SIZE = 640
    if img.width > MAX_SIZE or img.height > MAX_SIZE:
        img.thumbnail((MAX_SIZE, MAX_SIZE), Image.LANCZOS)

    model = get_model()

    with _inference_lock:
        results = model(img, imgsz=640, verbose=False)
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
        infected_points.append({"x": cx, "y": cy, "conf": float(conf)})

    return infected_points


try:
    get_model()
except Exception:
    pass