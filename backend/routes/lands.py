from flask import Blueprint, jsonify, request

from services.database import (
    delete_land,
    get_land,
    get_lands,
    get_scans_by_land,
    update_land_name,
)

lands_bp = Blueprint("lands", __name__)


@lands_bp.route("/lands", methods=["GET"])
def list_lands():
    device_id = request.headers.get("X-Device-Id", "unknown")
    lands = get_lands(device_id)
    return jsonify({"lands": lands})


@lands_bp.route("/lands/<int:land_id>", methods=["GET"])
def get_land_detail(land_id):
    land = get_land(land_id)
    if land is None:
        return jsonify({"error": "Land not found"}), 404
    return jsonify({"land": land})


@lands_bp.route("/lands/<int:land_id>/scans", methods=["GET"])
def list_land_scans(land_id):
    land = get_land(land_id)
    if land is None:
        return jsonify({"error": "Land not found"}), 404
    scans = get_scans_by_land(land_id, include_payload=False)
    return jsonify({"scans": scans})


@lands_bp.route("/lands/<int:land_id>", methods=["PATCH"])
def rename_land(land_id):
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Name is required"}), 400
    updated = update_land_name(land_id, name)
    if not updated:
        return jsonify({"error": "Land not found"}), 404
    land = get_land(land_id)
    return jsonify({"message": "Land renamed", "land": land})


@lands_bp.route("/lands/<int:land_id>", methods=["DELETE"])
def remove_land(land_id):
    deleted = delete_land(land_id)
    if not deleted:
        return jsonify({"error": "Land not found"}), 404
    return jsonify({"message": "Land deleted"})
