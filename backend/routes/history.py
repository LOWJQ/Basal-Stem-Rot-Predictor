import os
import uuid

from flask import Blueprint, jsonify, request, send_file
from services.database import (
    get_history,
    get_scan,
    update_scan_title,
    update_scan_payload,
    delete_scan,
    delete_all_scans,
)
from services.pdf_export import build_report_pdf
from services.excel_export import build_report_excel
from services.report_builder import build_simulation_summary
from services.simulate_future_heatmap import grid_to_risk_map, simulate_future_steps
from services.visualization import draw_heatmap

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "output")
FRAMES_DIR = os.path.join(OUTPUT_DIR, "frames")
SOURCE_DIR = os.path.join(OUTPUT_DIR, "sources")

os.makedirs(FRAMES_DIR, exist_ok=True)


def _build_output_url(base_url, relative_path):
    return f"{base_url}/outputs/{relative_path.replace(os.sep, '/')}"

history_bp = Blueprint("history", __name__)


@history_bp.route("/history", methods=["GET"])
def history():
    return jsonify({"scans": get_history(limit=20)})


@history_bp.route("/history/<int:scan_id>", methods=["GET"])
def history_detail(scan_id):
    scan = get_scan(scan_id)
    if scan is None:
        return jsonify({"error": "History entry not found"}), 404
    return jsonify({"scan": scan})


@history_bp.route("/history/<int:scan_id>/report", methods=["GET"])
def history_report(scan_id):
    scan = get_scan(scan_id)
    if scan is None:
        return jsonify({"error": "History entry not found"}), 404

    payload = scan.get("payload") or {}
    report = payload.get("report")

    if report is None:
        return jsonify({"error": "Report data not available for this scan"}), 404

    return jsonify({"report": report})


@history_bp.route("/history/<int:scan_id>/simulation-frames", methods=["GET"])
def history_simulation_frames(scan_id):
    scan = get_scan(scan_id)
    if scan is None:
        return jsonify({"error": "History entry not found"}), 404

    payload = scan.get("payload") or {}
    simulation_frames = payload.get("simulation_frames") or []
    simulation_status = payload.get("simulation_frames_status", "complete")
    simulation_expected_frames = payload.get(
        "simulation_expected_frames",
        len(simulation_frames),
    )
    heatmap_grid = payload.get("heatmap_grid") or []
    image_size = payload.get("image_size") or {}
    source_image_name = (payload.get("assets") or {}).get("source_image_name")
    output_image = payload.get("output_image")

    missing_frames = simulation_expected_frames > len(simulation_frames)
    if simulation_status != "complete" or missing_frames:
        if not heatmap_grid or not source_image_name:
            payload["simulation_frames_status"] = "error"
            update_scan_payload(scan_id, payload)
            return jsonify(
                {
                    "simulation_frames": simulation_frames,
                    "status": "error",
                    "expected_frames": simulation_expected_frames,
                }
            )

        source_image_path = os.path.join(SOURCE_DIR, source_image_name)
        if not os.path.exists(source_image_path):
            payload["simulation_frames_status"] = "error"
            update_scan_payload(scan_id, payload)
            return jsonify(
                {
                    "simulation_frames": simulation_frames,
                    "status": "error",
                    "expected_frames": simulation_expected_frames,
                }
            )

        width = int(image_size.get("width") or 0)
        height = int(image_size.get("height") or 0)

        try:
            payload["simulation_frames_status"] = "rendering"
            update_scan_payload(scan_id, payload)

            base_heatmap = [
                [{**cell, "factors": dict(cell["factors"])} for cell in row]
                for row in heatmap_grid
            ]
            future_steps = [base_heatmap] + simulate_future_steps(base_heatmap, steps=12)

            frame_urls = [output_image] if output_image else []
            for idx, step_heatmap in enumerate(future_steps[1:], start=1):
                step_risk_map = grid_to_risk_map(step_heatmap, width, height)
                frame_name = f"scan_{scan_id}_week_{idx}_{uuid.uuid4().hex}.jpg"
                frame_path = os.path.join(FRAMES_DIR, frame_name)
                draw_heatmap(
                    source_image_path,
                    step_risk_map,
                    [],
                    None,
                    frame_path,
                    week=idx,
                )
                frame_urls.append(
                    _build_output_url(request.host_url.rstrip("/"), os.path.join("frames", frame_name))
                )

            payload["simulation_frames"] = frame_urls
            payload["simulation_frames_status"] = "complete"
            if payload.get("report"):
                payload["report"]["simulation"] = build_simulation_summary(future_steps)
            update_scan_payload(scan_id, payload)
            simulation_frames = frame_urls
            simulation_status = "complete"
            simulation_expected_frames = len(frame_urls)
        except Exception:
            payload["simulation_frames_status"] = "error"
            update_scan_payload(scan_id, payload)
            return jsonify(
                {
                    "simulation_frames": simulation_frames,
                    "status": "error",
                    "expected_frames": simulation_expected_frames,
                }
            )

    return jsonify(
        {
            "simulation_frames": simulation_frames,
            "status": simulation_status,
            "expected_frames": simulation_expected_frames,
        }
    )


@history_bp.route("/history/<int:scan_id>/report/pdf", methods=["GET"])
def history_report_pdf(scan_id):
    scan = get_scan(scan_id)
    if scan is None:
        return jsonify({"error": "History entry not found"}), 404

    payload = scan.get("payload") or {}
    report = payload.get("report")

    if report is None:
        return jsonify({"error": "Report data not available for this scan"}), 404

    pdf_buffer = build_report_pdf(report)
    filename = f"bsr-report-{scan_id}.pdf"
    return send_file(
        pdf_buffer,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


@history_bp.route("/history/<int:scan_id>/report/excel", methods=["GET"])
def history_report_excel(scan_id):
    scan = get_scan(scan_id)
    if scan is None:
        return jsonify({"error": "History entry not found"}), 404

    payload = scan.get("payload") or {}
    report = payload.get("report")
    heatmap = payload.get("heatmap")

    if report is None or heatmap is None:
        return jsonify({"error": "Report data not available for this scan"}), 404

    excel_buffer = build_report_excel(payload, report)
    filename = f"bsr-data-{scan_id}.xlsx"
    return send_file(
        excel_buffer,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename,
    )


@history_bp.route("/history/<int:scan_id>", methods=["PATCH"])
def rename_history(scan_id):
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()

    if not title:
        return jsonify({"error": "Title is required"}), 400

    updated = update_scan_title(scan_id, title)
    if not updated:
        return jsonify({"error": "History entry not found"}), 404

    scan = get_scan(scan_id)
    return jsonify({"message": "History entry renamed", "scan": scan})


@history_bp.route("/history/<int:scan_id>", methods=["DELETE"])
def remove_history(scan_id):
    deleted = delete_scan(scan_id)
    if not deleted:
        return jsonify({"error": "History entry not found"}), 404

    return jsonify({"message": "History entry deleted"})

@history_bp.route("/history", methods=["DELETE"])
def remove_all_history():
    delete_all_scans()
    return jsonify({"message": "All history deleted"})
