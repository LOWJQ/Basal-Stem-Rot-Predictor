from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import cv2
import numpy as np
import uuid

from services.image_processing import detect_infected
from services.risk_analysis import generate_risk_map, generate_heatmap_grid
from services.visualization import draw_heatmap
from services.environmental_data import get_environmental_data

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(__file__)

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "status": "API is running",
        "endpoint": "/predict (POST)"
    })

@app.route("/predict", methods=["GET", "POST"])
def predict():
    temp_path = None

    lat = request.form.get("lat")
    lon = request.form.get("lon")

    if not lat or not lon:
        lat, lon = 3.1390, 101.6869  # Kuala Lumpur
    else:
        try:
            lat = float(lat)
            lon = float(lon)
        except:
            return jsonify({"error": "Invalid latitude/longitude"}), 400

    try:
        if request.method == "GET":
            return jsonify({
                "message": "Send a POST request with an image file using key 'image'"
            })
        
        env_data = get_environmental_data(lat, lon)

        file = request.files.get("image")

        if not file:
            return jsonify({"error": "No image uploaded"}), 400
        
        ALLOWED_TYPES = ["image/jpeg", "image/png"]

        if file.mimetype not in ALLOWED_TYPES:
            return jsonify({"error": "Invalid image type"}), 400
        
        from PIL import Image

        try:
            file.stream.seek(0)
            img_test = Image.open(file.stream)
            img_test.verify()
            file.stream.seek(0)
        except:
            return jsonify({"error": "Corrupted image file"}), 400

        file.stream.seek(0)
        file_bytes = np.frombuffer(file.read(), np.uint8)

        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({"error": "Invalid image file"}), 400

        height, width = img.shape[:2]

        temp_name = f"temp_{uuid.uuid4().hex}.jpg"
        temp_path = os.path.join(BASE_DIR, temp_name)
        cv2.imwrite(temp_path, img)

        infected_points = detect_infected(temp_path)
        risk_map = generate_risk_map(infected_points, width, height)
        heatmap = generate_heatmap_grid(risk_map)

        output_name = f"output_{uuid.uuid4().hex}.jpg"
        output_path = os.path.join(BASE_DIR, "output", "heatmap", output_name)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        output_image = draw_heatmap(temp_path, risk_map, infected_points, output_path)

        if output_image is None:
            return jsonify({"error": "Failed to process image"}), 400

        return jsonify({
            "status": "success",
            "data": {
                "image_size": {
                    "width": width,
                    "height": height
                },
                "infected_points": infected_points,
                "heatmap": heatmap,
                "environment": env_data,
                "output_image": output_image
            }
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


if __name__ == "__main__":
    app.run(debug=True)