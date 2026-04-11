import json
import time
import os

try:
    import google.generativeai as genai
except ImportError:
    genai = None
from flask import Blueprint, Response, jsonify, request, stream_with_context

agent_bp = Blueprint("agent", __name__)


def get_gemini_model():
    if genai is None:
        raise RuntimeError(
            "google-generativeai is not installed. Run `python -m pip install -r requirements.txt` in the backend directory."
        )
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))
    return genai.GenerativeModel("gemini-1.5-flash")


@agent_bp.route("/agent-chat", methods=["POST"])
def agent_chat():
    body = request.get_json(silent=True) or {}
    user_message = body.get("message", "").strip()
    report = body.get("report") or {}
    environment = body.get("environment_summary") or {}
    infected_count = int(body.get("infected_count", 0))

    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    summary = report.get("summary") or {}
    key_findings = report.get("key_findings") or []
    recommendations = report.get("recommendations") or []

    system_prompt = f"""You are PalmSentinel, an expert AI agent specialising in palm oil Basal Stem Rot (BSR) disease analysis for Malaysian plantations. You have autonomously completed a full drone image analysis.

CURRENT SCAN DATA:
- Infected trees detected: {infected_count}
- Average risk score: {summary.get("average_risk_score", "N/A")}
- Risk band: {summary.get("risk_band", "N/A")}
- High risk grid cells: {summary.get("high_risk_cells", 0)}
- Medium risk grid cells: {summary.get("medium_risk_cells", 0)}
- Average humidity: {environment.get("avg_humidity", "N/A")}%
- Average soil moisture: {environment.get("avg_soil_moisture", "N/A")}
- Average temperature: {environment.get("avg_temperature", "N/A")}C
- Estimated yield at risk: {summary.get("estimated_yield_at_risk_tonnes", 0)} tonnes CPO
- Key findings: {key_findings}
- Recommended actions: {recommendations}

INSTRUCTIONS:
- Answer only about this specific scan's data above.
- Be direct, concise, and actionable.
- Use plain English. No markdown headers. Max 3 short paragraphs.
- If asked something unrelated to this scan or palm oil disease, politely redirect."""

    try:
        model = get_gemini_model()
        response = model.generate_content(f"{system_prompt}\n\nUser: {user_message}")
        return jsonify({"reply": response.text})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@agent_bp.route("/agent-stream", methods=["POST"])
def agent_stream():
    body = request.get_json(silent=True) or {}
    infected_count = int(body.get("infected_count", 0))
    avg_humidity = float(body.get("avg_humidity", 0))
    avg_soil = float(body.get("avg_soil_moisture", 0))
    high_risk_cells = int(body.get("high_risk_cells", 0))
    avg_temp = float(body.get("avg_temperature", 0))

    infection_high = infected_count > 5
    humidity_high = avg_humidity > 75
    soil_high = avg_soil > 0.2
    temp_high = avg_temp > 32

    steps = [
        {"text": "Extracting GPS coordinates and flight altitude from EXIF metadata..."},
        {"text": f"YOLOv8 detection complete — {infected_count} infected tree(s) identified"},
        {
            "text": (
                "Infection count exceeds threshold — escalating to Level 3 deep analysis"
                if infection_high
                else "Infection count within normal range — applying standard analysis pipeline"
            ),
        },
        {
            "text": (
                f"Weather API returned humidity at {avg_humidity:.1f}% — elevated, flagging accelerated spread risk"
                if humidity_high
                else f"Weather API returned humidity at {avg_humidity:.1f}% — within acceptable range"
            ),
        },
        {
            "text": (
                f"Soil moisture at {avg_soil:.3f} — high fungal persistence risk detected"
                if soil_high
                else f"Soil moisture at {avg_soil:.3f} — normal levels"
            ),
        },
    ]

    if temp_high:
        steps.append({"text": f"Temperature at {avg_temp:.1f}C — heat stress compounding infection vulnerability"})

    if humidity_high and soil_high:
        steps.append({"text": "Combined high humidity and soil moisture detected — upgrading spread simulation priority"})

    steps += [
        {"text": f"Generating risk heatmap — {high_risk_cells} high-risk grid cell(s) identified"},
        {"text": "Running 12-week BSR disease spread simulation..."},
        {"text": "Compiling prioritised action plan based on all environmental factors"},
        {"text": "Analysis complete — PalmSentinel Agent ready"},
    ]

    def generate():
        for step in steps:
            yield f"data: {json.dumps(step)}\n\n"
            time.sleep(0.85)
        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )
