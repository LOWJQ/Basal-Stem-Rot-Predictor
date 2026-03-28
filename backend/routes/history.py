from flask import Blueprint, jsonify, request, send_file
from services.database import (
    get_history,
    get_scan,
    update_scan_title,
    delete_scan,
    delete_all_scans,
)
from services.pdf_export import build_report_pdf
from services.excel_export import build_report_excel

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
