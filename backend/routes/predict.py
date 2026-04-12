from datetime import datetime
import logging
import os
import uuid
import base64

import cv2
import numpy as np
from flask import Blueprint, jsonify, request

from services.database import get_plot_history
from services.database import save_scan
from services.env_interpolation import (
    apply_infection_env_variation,
    interpolate_env,
    sample_environment,
)
from services.environmental_data import get_env_cached
from services.geo_utils import generate_grid_coordinates
from services.image_processing import detect_infected
from services.report_builder import build_report
from services.risk_analysis import generate_heatmap_grid, generate_risk_map
from services.simulate_future_heatmap import grid_to_risk_map
from services.simulation_frames import (
    DEFAULT_SIMULATION_EXPECTED_FRAMES,
    submit_simulation_frame_render,
)
from services.visualization import draw_heatmap


logger = logging.getLogger(__name__)

predict_bp = Blueprint("predict", __name__)

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
SOURCE_DIR = os.path.join(OUTPUT_DIR, "sources")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(SOURCE_DIR, exist_ok=True)


def _generate_suggested_questions(*, report, environment_summary, previous_scan=None):
    summary = report.get("summary") or {}
    questions = []

    soil_moisture = float(environment_summary.get("avg_soil_moisture") or 0)
    infected_count = int(summary.get("infected_tree_count") or 0)
    current_risk_score = float(summary.get("average_risk_score") or 0)
    high_risk_zones = int(summary.get("high_risk_cells") or 0)

    previous_payload = (previous_scan or {}).get("payload") or {}
    previous_report = previous_payload.get("report") or {}
    previous_summary = previous_report.get("summary") or {}
    previous_risk_score = previous_summary.get("average_risk_score")

    if soil_moisture >= 0.2:
        questions.append("Will the current soil moisture make fungal persistence worse in this plot?")

    if infected_count > 0:
        questions.append("What immediate isolation or treatment action should I take for the infected trees?")

    try:
        if previous_risk_score is not None and current_risk_score > float(previous_risk_score):
            questions.append("Why is the risk score worsening compared with the last scan?")
    except (TypeError, ValueError):
        pass

    if high_risk_zones > 4:
        questions.append("Which high-risk zones should I prioritise first?")

    fallback_questions = [
        "What is the most urgent action I should take from this scan?",
        "Which environmental factor is contributing most to the current risk?",
        "How likely is this infection to spread if I do nothing this week?",
        "What should I monitor before the next scan?",
    ]

    for question in fallback_questions:
        if len(questions) >= 4:
            break
        if question not in questions:
            questions.append(question)

    return questions[:4]


@predict_bp.route("/predict", methods=["GET", "POST"])
def predict():
    temp_path = None

    device_id = request.headers.get("X-Device-Id", "unknown")

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

        if file.mimetype not in ["image/jpeg", "image/png"]:
            return jsonify({"error": "Invalid image type"}), 400

        from PIL import Image

        try:
            file.stream.seek(0)
            img_test = Image.open(file.stream)
            img_test.verify()
            file.stream.seek(0)
        except Exception as exc:
            logger.warning("Corrupted image upload attempted: %s", exc)
            return jsonify({"error": "Corrupted image file"}), 400

        file.stream.seek(0)
        file_bytes = np.frombuffer(file.read(), np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if img is None:
            return jsonify({"error": "Invalid image file"}), 400

        height, width = img.shape[:2]
        image_id = uuid.uuid4().hex

        temp_name = f"temp_{image_id}.jpg"
        temp_path = os.path.join(BASE_DIR, temp_name)
        cv2.imwrite(temp_path, img)

        source_name = f"source_{image_id}.jpg"
        source_path = os.path.join(SOURCE_DIR, source_name)
        cv2.imwrite(source_path, img)

        infected_points = detect_infected(temp_path)
        grid_coords = generate_grid_coordinates(lat, lon, altitude)

        samples = sample_environment(
            grid_coords,
            infected_points,
            get_env_cached,
            width,
            height,
        )

        env_grid = interpolate_env(grid_coords, samples)
        env_grid = apply_infection_env_variation(
            env_grid,
            infected_points,
            width,
            height,
        )
        risk_map = generate_risk_map(infected_points, width, height, env_grid)

        heatmap_grid, flat_heatmap = generate_heatmap_grid(
            risk_map,
            env_grid,
            infected_points,
            grid_coords,
        )

        heatmap_now = [
            [{**cell, "factors": dict(cell["factors"])} for cell in row]
            for row in heatmap_grid
        ]

        output_name = f"output_{uuid.uuid4().hex}.jpg"
        output_path = os.path.join(OUTPUT_DIR, output_name)
        risk_map_now = grid_to_risk_map(heatmap_grid, width, height)

        output_image = draw_heatmap(
            temp_path,
            risk_map_now,
            infected_points,
            env_grid,
            output_path,
        )

        if output_image is None:
            logger.error("draw_heatmap returned None; image processing failed")
            return jsonify({"error": "Failed to process image"}), 400

        avg_soil = np.mean([value["soil_moisture"] for value in samples.values()])
        avg_humidity = np.mean([value["humidity"] for value in samples.values()])
        avg_temp = np.mean([value["temperature"] for value in samples.values()])

        job_id = uuid.uuid4().hex

        # Read the saved output image as base64
        with open(output_path, "rb") as f:
            output_b64 = base64.b64encode(f.read()).decode("utf-8")
        output_url = f"data:image/jpeg;base64,{output_b64}"

        environment_summary = {
            "avg_soil_moisture": round(float(avg_soil), 3),
            "avg_humidity": round(float(avg_humidity), 3),
            "avg_temperature": round(float(avg_temp), 3),
        }

        default_title = f"Scan {datetime.now().strftime('%b %d, %I:%M %p')}"
        simulation_expected_frames = DEFAULT_SIMULATION_EXPECTED_FRAMES

        response_data = {
            "image_size": {"width": width, "height": height},
            "infected_points": infected_points,
            "heatmap": flat_heatmap,
            "heatmap_grid": heatmap_now,
            "grid_coordinates": grid_coords,
            "environment_summary": {
                "sampled_points": len(samples),
                **environment_summary,
            },
            "output_image": output_url,
            "output_image_b64": output_url,
            "simulation_frames": [output_url],
            "simulation_frames_status": "pending",
            "simulation_expected_frames": simulation_expected_frames,
            "env_grid": env_grid,
            "assets": {
                "source_image_name": source_name,
                "output_image_name": output_name,
            },
            "id": job_id,
        }

        response_data["report"] = build_report(
            report_id=job_id,
            title=default_title,
            lat=lat,
            lon=lon,
            altitude=altitude,
            infected_points=infected_points,
            flat_heatmap=flat_heatmap,
            environment_summary=environment_summary,
            simulation_steps=None,
            simulation_summary={
                "weeks_simulated": 12,
                "average_risk_start": round(
                    (
                        sum(float(cell["risk_score"]) for cell in flat_heatmap) / len(flat_heatmap)
                        if flat_heatmap
                        else 0.0
                    ),
                    4,
                ) if flat_heatmap else None,
                "average_risk_end": None,
                "trend": "Simulation summary will update after future frames are generated.",
            },
            output_image=output_url,
            image_width=width,
            image_height=height,
            generated_at=datetime.utcnow().isoformat(),
        )

        previous_plot_scans = get_plot_history(
            lat=lat,
            lon=lon,
            device_id=device_id,
            limit=1,
            include_payload=True,
        )
        previous_scan = previous_plot_scans[0] if previous_plot_scans else None

        response_data["suggested_questions"] = _generate_suggested_questions(
            report=response_data["report"],
            environment_summary=environment_summary,
            previous_scan=previous_scan,
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
            device_id=device_id,
        )

        response_data["history_id"] = scan_id
        response_data["title"] = default_title

        submit_simulation_frame_render(scan_id)

        logger.info(
            "Predict success - lat=%s lon=%s infected=%s id=%s device=%s",
            lat,
            lon,
            len(infected_points),
            job_id,
            device_id,
        )

        return jsonify({"status": "success", "data": response_data})

    except Exception as exc:
        logger.exception("Unhandled error in /predict - lat=%s lon=%s: %s", lat, lon, exc)
        return jsonify({"error": "An internal error occurred. Please try again."}), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
