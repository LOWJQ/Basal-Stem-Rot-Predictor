from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import cv2
import numpy as np
import uuid

from services.simulate_future_heatmap import grid_to_risk_map, simulate_future_heatmap
from services.env_interpolation import interpolate_env, sample_environment
from services.geo_utils import generate_grid_coordinates
from services.image_processing import detect_infected
from services.risk_analysis import generate_risk_map, generate_heatmap_grid
from services.visualization import draw_heatmap
from services.environmental_data import get_env_cached
from services.simulate_future_heatmap import simulate_future_steps
from services.gif_generator import create_gif

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(__file__)


@app.route("/", methods=["GET"])
def home():
    return jsonify({"status": "API is running", "endpoint": "/predict (POST)"})


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

    altitude = request.form.get("altitude")

    if not altitude:
        altitude = 50  # default (meters)
    else:
        try:
            altitude = float(altitude)
        except:
            return jsonify({"error": "Invalid altitude"}), 400

    try:
        if request.method == "GET":
            return jsonify(
                {"message": "Send a POST request with an image file using key 'image'"}
            )

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

        grid_coords = generate_grid_coordinates(lat, lon, altitude)

        samples = sample_environment(
            grid_coords, infected_points, get_env_cached, width, height
        )

        env_grid = interpolate_env(grid_coords, samples)

        risk_map = generate_risk_map(infected_points, width, height, env_grid)

        heatmap = generate_heatmap_grid(
            risk_map, env_grid, infected_points, grid_coords
        )

        future_steps = [heatmap] + simulate_future_steps(heatmap, steps=6)

        frame_paths = []

        for idx, step_heatmap in enumerate(future_steps):

            step_risk_map = grid_to_risk_map(step_heatmap, width, height)

            frame_name = f"frame_{idx}_{uuid.uuid4().hex}.jpg"
            frame_path = os.path.join(BASE_DIR, "output", "heatmap", frame_name)

            draw_heatmap(
                temp_path,
                step_risk_map,
                [],  
                env_grid,
                frame_path,
                week = idx if idx > 0 else "Now", 
            )

            frame_paths.append(frame_path)

        gif_name = f"prediction_{uuid.uuid4().hex}.gif"
        gif_path = os.path.join(BASE_DIR, "output", "heatmap", gif_name)

        gif_output = create_gif(frame_paths, gif_path)

        for path in frame_paths:
            if os.path.exists(path):
                os.remove(path)

        output_name = f"output_{uuid.uuid4().hex}.jpg"
        output_path = os.path.join(BASE_DIR, "output", "heatmap", output_name)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        output_image = draw_heatmap(
            temp_path,
            risk_map,
            infected_points,
            env_grid,
            output_path,
        )

        if output_image is None:
            return jsonify({"error": "Failed to process image"}), 400

        avg_soil = np.mean([v["soil_moisture"] for v in samples.values()])
        avg_humidity = np.mean([v["humidity"] for v in samples.values()])
        avg_temp = np.mean([v["temperature"] for v in samples.values()])

        return jsonify(
            {
                "status": "success",
                "data": {
                    "image_size": {"width": width, "height": height},
                    "infected_points": infected_points,
                    "heatmap": heatmap,
                    "environment_summary": {
                        "sampled_points": len(samples),
                        "avg_soil_moisture": float(avg_soil),
                        "avg_humidity": float(avg_humidity),
                        "avg_temperature": float(avg_temp),
                    },
                    "output_image": output_image,
                    "future_output_image": gif_output,
                    "frames": frame_paths
                },
            }
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


if __name__ == "__main__":
    app.run(debug=False)
