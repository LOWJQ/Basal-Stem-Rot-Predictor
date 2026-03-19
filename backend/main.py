from flask import Flask, request, jsonify
import os
import cv2
import numpy as np
import uuid

from services.image_processing import detect_infected
from services.risk_analysis import generate_heatmap
from services.visualization import draw_heatmap

app = Flask(__name__)

BASE_DIR = os.path.dirname(__file__)

@app.route("/predict", methods=["POST"])
def predict():
    temp_path = None

    try:
        file = request.files.get("image")

        if not file:
            return jsonify({"error": "No image uploaded"}), 400

        file_bytes = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({"error": "Invalid image file"}), 400

        height, width = img.shape[:2]

        temp_name = f"temp_{uuid.uuid4().hex}.jpg"
        temp_path = os.path.join(BASE_DIR, temp_name)
        cv2.imwrite(temp_path, img)

        infected_points = detect_infected(temp_path)

        heatmap = generate_heatmap(infected_points, width, height)

        output_name = f"output_{uuid.uuid4().hex}.jpg"
        output_path = os.path.join(BASE_DIR, "output", "heatmap", output_name)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        output_image = draw_heatmap(temp_path, infected_points, output_path)

        if output_image is None:
            return jsonify({"error": "Failed to process image"}), 400
      
        return jsonify({
            "heatmap": heatmap,
            "infected_points": infected_points,
            "image_width": width,
            "image_height": height,
            "output_image": output_image
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

if __name__ == "__main__":
    app.run(debug=True)