from flask import Blueprint, request, jsonify
from datetime import datetime
import os
import cv2
import numpy as np
import uuid
import logging

from services.simulate_future_heatmap import grid_to_risk_map
from services.env_interpolation import (
    interpolate_env,
    sample_environment,
    apply_infection_env_variation,
)
from services.geo_utils import generate_grid_coordinates
from services.image_processing import detect_infected
from services.risk_analysis import generate_risk_map, generate_heatmap_grid
from services.visualization import draw_heatmap
from services.environmental_data import get_env_cached
from services.simulate_future_heatmap import simulate_future_steps
from services.database import save_scan
from services.report_builder import build_report


logger = logging.getLogger(__name__)

predict_bp = Blueprint("predict", __name__)

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
FRAMES_DIR = os.path.join(BASE_DIR, "output", "frames")
os.makedirs(FRAMES_DIR, exist_ok=True)


@predict_bp.route("/predict", methods=["GET", "POST"])
def predict():
    temp_path = None

    lat = request.form.get("lat")
    lon = request.form.get("lon")

    if not lat or not lon:
        lat, lon = 3.1390, 101.6869
    else:
        try:
            lat = float(lat)
            lon = float(lon)
        except ValueError:
            return jsonify({"error": "Invalid latitude/longitude"}), 400

    altitude = request.form.get("altitude")

    if not altitude:
        altitude = 50
    else:
        try:
            altitude = float(altitude)
        except ValueError:
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
        except Exception as e:
            logger.warning(f"Corrupted image upload attempted: {e}")
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
        env_grid = apply_infection_env_variation(
            env_grid, infected_points, width, height
        )
        risk_map = generate_risk_map(infected_points, width, height, env_grid)

        heatmap, flat_heatmap = generate_heatmap_grid(
            risk_map, env_grid, infected_points, grid_coords
        )

        heatmap_now = [
            [{**cell, "factors": dict(cell["factors"])} for cell in row]
            for row in heatmap
        ]

        future_steps = [heatmap_now] + simulate_future_steps(heatmap_now, steps=12)

        frame_paths = []
        for idx, step_heatmap in enumerate(future_steps):
            step_risk_map = grid_to_risk_map(step_heatmap, width, height)
            frame_name = f"frame_{idx}_{uuid.uuid4().hex}.jpg"
            frame_path = os.path.join(FRAMES_DIR, frame_name)
            draw_heatmap(
                temp_path,
                step_risk_map,
                [],
                env_grid,
                frame_path,
                week=idx if idx > 0 else "Now",
            )
            frame_paths.append(frame_path)

        output_name = f"output_{uuid.uuid4().hex}.jpg"
        output_path = os.path.join(BASE_DIR, "output", output_name)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        heatmap_now = heatmap
        risk_map_now = grid_to_risk_map(heatmap_now, width, height)

        output_image = draw_heatmap(
            temp_path,
            risk_map_now,
            infected_points,
            env_grid,
            output_path,
        )

        if output_image is None:
            logger.error("draw_heatmap returned None — image processing failed")
            return jsonify({"error": "Failed to process image"}), 400

        avg_soil = np.mean([v["soil_moisture"] for v in samples.values()])
        avg_humidity = np.mean([v["humidity"] for v in samples.values()])
        avg_temp = np.mean([v["temperature"] for v in samples.values()])

        base_url = request.host_url.rstrip("/")
        frame_urls = [
            f"{base_url}/outputs/frames/{os.path.basename(path)}"
            for path in frame_paths
        ]
        output_url = f"{base_url}/outputs/{output_name}"
        job_id = uuid.uuid4().hex

        environment_summary = {
            "avg_soil_moisture": round(float(avg_soil), 3),
            "avg_humidity": round(float(avg_humidity), 3),
            "avg_temperature": round(float(avg_temp), 3),
        }

        response_data = {
            "image_size": {"width": width, "height": height},
            "infected_points": infected_points,
            "heatmap": flat_heatmap,
            "heatmap_grid": heatmap,
            "grid_coordinates": grid_coords,
            "environment_summary": {
                "sampled_points": len(samples),
                **environment_summary,
            },
            "output_image": output_url,
            "simulation_frames": frame_urls,
            "id": job_id,
        }

        default_title = f"Scan {datetime.now().strftime('%b %d, %I:%M %p')}"

        response_data["report"] = build_report(
            report_id=job_id,
            title=default_title,
            lat=lat,
            lon=lon,
            altitude=altitude,
            infected_points=infected_points,
            flat_heatmap=flat_heatmap,
            environment_summary=environment_summary,
            simulation_steps=future_steps,
            output_image=output_url,
            image_width=width,
            image_height=height,
            generated_at=datetime.utcnow().isoformat(),
        )

        scan_id = save_scan(
            lat,
            lon,
            altitude,
            infected_points,
            flat_heatmap,
            environment_summary,
            payload=response_data,
            title=default_title,
        )

        response_data["history_id"] = scan_id
        response_data["title"] = default_title

        logger.info(
            f"Predict success — lat={lat} lon={lon} infected={len(infected_points)} id={job_id}"
        )

        return jsonify(
            {
                "status": "success",
                "data": response_data,
            }
        )

    except Exception as e:
        logger.exception(f"Unhandled error in /predict — lat={lat} lon={lon}: {e}")
        return jsonify({"error": "An internal error occurred. Please try again."}), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
