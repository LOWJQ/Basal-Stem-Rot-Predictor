from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import logging
import os
import uuid

import cv2
import numpy as np
from flask import Blueprint, jsonify, request

from services.database import get_scan, save_scan, update_scan_payload
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
from services.simulate_future_heatmap import grid_to_risk_map, simulate_future_steps
from services.visualization import draw_heatmap


logger = logging.getLogger(__name__)

predict_bp = Blueprint("predict", __name__)

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
FRAMES_DIR = os.path.join(OUTPUT_DIR, "frames")
SOURCE_DIR = os.path.join(OUTPUT_DIR, "sources")
SIMULATION_RENDER_EXECUTOR = ThreadPoolExecutor(max_workers=1)

os.makedirs(FRAMES_DIR, exist_ok=True)
os.makedirs(SOURCE_DIR, exist_ok=True)


def _build_output_url(base_url, relative_path):
    return f"{base_url}/outputs/{relative_path.replace(os.sep, '/')}"


def _render_simulation_frames(scan_id, base_url):
    scan = get_scan(scan_id)
    if scan is None:
        logger.warning("Simulation render skipped because scan %s was not found", scan_id)
        return

    payload = scan.get("payload") or {}
    simulation_steps = payload.get("simulation_steps") or []
    source_image_name = (payload.get("assets") or {}).get("source_image_name")
    env_grid = payload.get("env_grid")
    image_size = payload.get("image_size") or {}
    output_image = payload.get("output_image")

    if not simulation_steps or not source_image_name or not env_grid:
        logger.warning(
            "Simulation render skipped for scan %s because required payload data is missing",
            scan_id,
        )
        return

    source_image_path = os.path.join(SOURCE_DIR, source_image_name)
    if not os.path.exists(source_image_path):
        payload["simulation_frames_status"] = "error"
        update_scan_payload(scan_id, payload)
        logger.warning(
            "Simulation render failed for scan %s because source image is missing",
            scan_id,
        )
        return

    width = int(image_size.get("width") or 0)
    height = int(image_size.get("height") or 0)
    frame_urls = [output_image] if output_image else []

    try:
        for idx, step_heatmap in enumerate(simulation_steps[1:], start=1):
            step_risk_map = grid_to_risk_map(step_heatmap, width, height)
            frame_name = f"scan_{scan_id}_week_{idx}_{uuid.uuid4().hex}.jpg"
            frame_path = os.path.join(FRAMES_DIR, frame_name)
            draw_heatmap(
                source_image_path,
                step_risk_map,
                [],
                env_grid,
                frame_path,
                week=idx,
            )
            frame_urls.append(
                _build_output_url(base_url, os.path.join("frames", frame_name))
            )

        payload["simulation_frames"] = frame_urls
        payload["simulation_frames_status"] = "complete"
        update_scan_payload(scan_id, payload)
        logger.info("Simulation frames rendered in background for scan %s", scan_id)
    except Exception as exc:
        payload["simulation_frames_status"] = "error"
        update_scan_payload(scan_id, payload)
        logger.exception(
            "Background simulation frame rendering failed for scan %s: %s",
            scan_id,
            exc,
        )


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

        allowed_types = ["image/jpeg", "image/png"]
        if file.mimetype not in allowed_types:
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

        heatmap, flat_heatmap = generate_heatmap_grid(
            risk_map,
            env_grid,
            infected_points,
            grid_coords,
        )

        heatmap_now = [
            [{**cell, "factors": dict(cell["factors"])} for cell in row]
            for row in heatmap
        ]
        future_steps = [heatmap_now] + simulate_future_steps(heatmap_now, steps=12)

        output_name = f"output_{uuid.uuid4().hex}.jpg"
        output_path = os.path.join(OUTPUT_DIR, output_name)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        risk_map_now = grid_to_risk_map(heatmap, width, height)
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

        base_url = request.host_url.rstrip("/")
        output_url = _build_output_url(base_url, output_name)
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
            "simulation_frames": [output_url],
            "simulation_frames_status": "pending",
            "simulation_expected_frames": len(future_steps),
            "simulation_steps": future_steps,
            "env_grid": env_grid,
            "assets": {
                "source_image_name": source_name,
                "output_image_name": output_name,
            },
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

        SIMULATION_RENDER_EXECUTOR.submit(_render_simulation_frames, scan_id, base_url)

        logger.info(
            "Predict success - lat=%s lon=%s infected=%s id=%s",
            lat,
            lon,
            len(infected_points),
            job_id,
        )

        return jsonify({"status": "success", "data": response_data})

    except Exception as exc:
        logger.exception("Unhandled error in /predict - lat=%s lon=%s: %s", lat, lon, exc)
        return jsonify({"error": "An internal error occurred. Please try again."}), 500

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
