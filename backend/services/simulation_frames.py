from concurrent.futures import ThreadPoolExecutor
import logging
import os
import threading
import uuid

from services.database import get_scan, update_scan_payload
from services.report_builder import build_simulation_summary
from services.simulate_future_heatmap import grid_to_risk_map, simulate_future_steps
from services.visualization import draw_heatmap


logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
FRAMES_DIR = os.path.join(OUTPUT_DIR, "frames")
SOURCE_DIR = os.path.join(OUTPUT_DIR, "sources")

SIMULATION_RENDER_EXECUTOR = ThreadPoolExecutor(max_workers=2)
_active_render_lock = threading.Lock()
_active_renders = set()

os.makedirs(FRAMES_DIR, exist_ok=True)
os.makedirs(SOURCE_DIR, exist_ok=True)

DEFAULT_SIMULATION_EXPECTED_FRAMES = 13


def build_output_url(base_url, relative_path):
    return f"{base_url}/outputs/{relative_path.replace(os.sep, '/')}"


def _mark_render_active(scan_id):
    with _active_render_lock:
        if scan_id in _active_renders:
            return False
        _active_renders.add(scan_id)
        return True


def _clear_render_active(scan_id):
    with _active_render_lock:
        _active_renders.discard(scan_id)


def _render_simulation_frames(scan_id, base_url):
    scan = get_scan(scan_id)
    if scan is None:
        logger.warning("Simulation render skipped - scan %s not found", scan_id)
        return False

    payload = scan.get("payload") or {}
    existing_frames = payload.get("simulation_frames") or []
    expected_frames = int(payload.get("simulation_expected_frames") or DEFAULT_SIMULATION_EXPECTED_FRAMES)
    status = payload.get("simulation_frames_status", "pending")

    if status == "complete" and len(existing_frames) >= expected_frames:
        return True

    source_image_name = (payload.get("assets") or {}).get("source_image_name")
    env_grid = payload.get("env_grid")
    image_size = payload.get("image_size") or {}
    output_image_url = payload.get("output_image")
    initial_heatmap = payload.get("heatmap_grid")

    if not initial_heatmap or not source_image_name or not env_grid:
        logger.warning(
            "Simulation render skipped for scan %s - missing heatmap_grid, source_image_name, or env_grid",
            scan_id,
        )
        payload["simulation_frames_status"] = "error"
        update_scan_payload(scan_id, payload)
        return False

    source_image_path = os.path.join(SOURCE_DIR, source_image_name)
    if not os.path.exists(source_image_path):
        logger.warning(
            "Simulation render failed for scan %s - source image missing at %s",
            scan_id, source_image_path,
        )
        payload["simulation_frames_status"] = "error"
        update_scan_payload(scan_id, payload)
        return False

    width = int(image_size.get("width") or 0)
    height = int(image_size.get("height") or 0)
    if width <= 0 or height <= 0:
        logger.warning("Simulation render failed for scan %s - invalid image dimensions", scan_id)
        payload["simulation_frames_status"] = "error"
        update_scan_payload(scan_id, payload)
        return False

    try:
        payload["simulation_frames_status"] = "rendering"
        update_scan_payload(scan_id, payload)

        frame_urls = [output_image_url] if output_image_url else []
        future_steps = simulate_future_steps(initial_heatmap, steps=12)

        for idx, step_heatmap in enumerate(future_steps, start=1):
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
                build_output_url(base_url, os.path.join("frames", frame_name))
            )

        payload["simulation_frames"] = frame_urls
        payload["simulation_frames_status"] = "complete"
        if payload.get("report"):
            payload["report"]["simulation"] = build_simulation_summary(
                [initial_heatmap] + future_steps
            )
        update_scan_payload(scan_id, payload)
        logger.info(
            "Simulation frames complete for scan %s (%d frames)", scan_id, len(frame_urls)
        )
        return True
    except Exception as exc:
        logger.exception("Simulation rendering failed for scan %s: %s", scan_id, exc)
        payload["simulation_frames_status"] = "error"
        update_scan_payload(scan_id, payload)
        return False


def _background_render(scan_id, base_url):
    try:
        _render_simulation_frames(scan_id, base_url)
    finally:
        _clear_render_active(scan_id)


def submit_simulation_frame_render(scan_id, base_url):
    if not _mark_render_active(scan_id):
        return False
    try:
        SIMULATION_RENDER_EXECUTOR.submit(_background_render, scan_id, base_url)
        return True
    except Exception:
        _clear_render_active(scan_id)
        raise


def ensure_simulation_frames(scan_id, base_url):
    if not _mark_render_active(scan_id):
        return False
    try:
        return _render_simulation_frames(scan_id, base_url)
    finally:
        _clear_render_active(scan_id)
