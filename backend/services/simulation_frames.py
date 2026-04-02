import base64
import logging
import os
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

from services.database import get_scan, update_scan_payload
from services.report_builder import build_simulation_summary
from services.simulate_future_heatmap import grid_to_risk_map, simulate_future_steps
from services.visualization import draw_heatmap_to_bytes

logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
SOURCE_DIR = os.path.join(OUTPUT_DIR, "sources")

SIMULATION_RENDER_EXECUTOR = ThreadPoolExecutor(max_workers=2)
_active_render_lock = threading.Lock()
_active_renders = set()

os.makedirs(SOURCE_DIR, exist_ok=True)

DEFAULT_SIMULATION_EXPECTED_FRAMES = 13


def _mark_render_active(scan_id):
    with _active_render_lock:
        if scan_id in _active_renders:
            return False
        _active_renders.add(scan_id)
        return True


def _clear_render_active(scan_id):
    with _active_render_lock:
        _active_renders.discard(scan_id)


def _render_simulation_frames(scan_id):
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
    initial_heatmap = payload.get("heatmap_grid")
    initial_frame_b64 = payload.get("output_image_b64")

    if not initial_heatmap or not env_grid:
        logger.warning("Simulation render skipped for scan %s - missing data", scan_id)
        payload["simulation_frames_status"] = "error"
        update_scan_payload(scan_id, payload)
        return False

    source_image_path = None
    if source_image_name:
        candidate = os.path.join(SOURCE_DIR, source_image_name)
        if os.path.exists(candidate):
            source_image_path = candidate

    if source_image_path is None and not initial_frame_b64:
        logger.warning("Simulation render failed for scan %s - no source image", scan_id)
        payload["simulation_frames_status"] = "error"
        update_scan_payload(scan_id, payload)
        return False

    width = int(image_size.get("width") or 0)
    height = int(image_size.get("height") or 0)
    if width <= 0 or height <= 0:
        payload["simulation_frames_status"] = "error"
        update_scan_payload(scan_id, payload)
        return False

    try:
        payload["simulation_frames_status"] = "rendering"
        update_scan_payload(scan_id, payload)

        frame_b64_list = [initial_frame_b64] if initial_frame_b64 else []
        future_steps = simulate_future_steps(initial_heatmap, steps=12)

        for idx, step_heatmap in enumerate(future_steps, start=1):
            step_risk_map = grid_to_risk_map(step_heatmap, width, height)
            img_bytes = draw_heatmap_to_bytes(
                source_image_path,
                step_risk_map,
                [],
                env_grid,
                week=idx,
            )
            if img_bytes:
                b64 = base64.b64encode(img_bytes).decode("utf-8")
                frame_b64_list.append(f"data:image/jpeg;base64,{b64}")

        payload["simulation_frames"] = frame_b64_list
        payload["simulation_frames_status"] = "complete"

        if payload.get("report"):
            payload["report"]["simulation"] = build_simulation_summary(
                [initial_heatmap] + future_steps
            )

        update_scan_payload(scan_id, payload)
        logger.info("Simulation frames complete for scan %s (%d frames)", scan_id, len(frame_b64_list))
        return True

    except Exception as exc:
        logger.exception("Simulation rendering failed for scan %s: %s", scan_id, exc)
        payload["simulation_frames_status"] = "error"
        update_scan_payload(scan_id, payload)
        return False


def _background_render(scan_id):
    try:
        _render_simulation_frames(scan_id)
    finally:
        _clear_render_active(scan_id)


def submit_simulation_frame_render(scan_id, base_url=None):
    if not _mark_render_active(scan_id):
        return False
    try:
        SIMULATION_RENDER_EXECUTOR.submit(_background_render, scan_id)
        return True
    except Exception:
        _clear_render_active(scan_id)
        raise