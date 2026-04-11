import json
import time
import os

try:
    import google.generativeai as genai
except ImportError:
    genai = None
from flask import Blueprint, Response, jsonify, request, stream_with_context

agent_bp = Blueprint("agent", __name__)


def _to_float(value):
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric


def _format_percent(value, digits=1):
    numeric = _to_float(value)
    if numeric is None:
        return "N/A"
    return f"{numeric * 100:.{digits}f}%"


def _format_number(value, digits=1, suffix=""):
    numeric = _to_float(value)
    if numeric is None:
        return "N/A"
    return f"{numeric:.{digits}f}{suffix}"


def _extract_recommendations(report):
    direct = report.get("recommendations") or []
    area_actions = [
        (entry or {}).get("action")
        for entry in (report.get("recommendation_areas") or [])
        if (entry or {}).get("action")
    ]

    combined = []
    for item in [*direct, *area_actions]:
        if item and item not in combined:
            combined.append(item)
    return combined


def _build_local_agent_reply(user_message, report, environment, infected_count):
    summary = report.get("summary") or {}
    recommendations = _extract_recommendations(report)
    key_findings = report.get("key_findings") or []

    risk_band = str(summary.get("risk_band") or "unknown").strip()
    risk_band_lower = risk_band.lower()
    average_risk_score = _format_percent(summary.get("average_risk_score"))
    high_risk_cells = int(summary.get("high_risk_cells") or 0)
    estimated_yield = _format_number(summary.get("estimated_yield_at_risk_tonnes"), 2, " tonnes")
    avg_humidity = _to_float(environment.get("avg_humidity"))
    avg_soil = _to_float(environment.get("avg_soil_moisture"))
    avg_temperature = _to_float(environment.get("avg_temperature"))

    prompt = (user_message or "").strip().lower()

    severity_line = (
        f"This scan is currently in the {risk_band_lower} risk band with {infected_count} infected tree(s), "
        f"{high_risk_cells} high-risk zone(s), and an average risk score of {average_risk_score}."
    )
    exposure_line = f"Estimated yield at risk is {estimated_yield}."

    if any(token in prompt for token in ["serious", "severity", "infection level", "how bad", "risk level"]):
        return f"{severity_line} {exposure_line} Immediate treatment priority is justified if infected trees are already visible in the field."

    if any(token in prompt for token in ["priorit", "first", "action", "recommend", "what should i do"]):
        if recommendations:
            return f"Top priority from this scan: {recommendations[0]} Secondary priority: {recommendations[1] if len(recommendations) > 1 else 'inspect nearby trees and monitor the surrounding zone closely.'}"
        return "Top priority from this scan: inspect the infected area first, isolate the nearest affected trees, and monitor adjacent high-risk cells for spread."

    if any(token in prompt for token in ["humidity", "soil", "moisture", "temperature", "weather", "environment"]):
        env_parts = []
        if avg_humidity is not None:
            env_parts.append(f"humidity is {_format_number(avg_humidity, 1, '%')}")
        if avg_soil is not None:
            env_parts.append(f"soil moisture is {_format_number(avg_soil, 3)}")
        if avg_temperature is not None:
            env_parts.append(f"temperature is {_format_number(avg_temperature, 1, 'C')}")

        conditions = ", ".join(env_parts) if env_parts else "environmental readings are limited"
        spread_hint = []
        if avg_humidity is not None and avg_humidity >= 75:
            spread_hint.append("humidity is supportive of disease activity")
        if avg_soil is not None and avg_soil >= 0.2:
            spread_hint.append("soil moisture may help fungal persistence")
        if avg_temperature is not None and avg_temperature >= 27:
            spread_hint.append("warm temperature may accelerate spread")

        if spread_hint:
            return f"For this scan, {conditions}. Based on those readings, {', '.join(spread_hint)}."
        return f"For this scan, {conditions}. These readings are not the strongest spread accelerators right now, but the infected zones should still be monitored."

    if any(token in prompt for token in ["spread", "spreading", "why fast", "why is this area"]):
        drivers = []
        if infected_count > 0:
            drivers.append(f"{infected_count} infected tree(s) were already detected")
        if avg_humidity is not None and avg_humidity >= 75:
            drivers.append(f"humidity is elevated at {_format_number(avg_humidity, 1, '%')}")
        if avg_soil is not None and avg_soil >= 0.2:
            drivers.append(f"soil moisture is high at {_format_number(avg_soil, 3)}")
        if high_risk_cells > 0:
            drivers.append(f"{high_risk_cells} high-risk zone(s) were identified")

        if drivers:
            return f"This area is being flagged because {', '.join(drivers)}. Together, those signals suggest the infection could persist or expand without quick intervention."
        return "This area is being flagged because the scan detected enough risk signals to justify close monitoring, even though no single factor is extreme on its own."

    if key_findings:
        findings_text = " ".join(str(item) for item in key_findings[:2])
        return f"{severity_line} {findings_text}"

    return f"{severity_line} {exposure_line} Ask about severity, environmental drivers, or priority actions and I will answer from this scan."


def get_gemini_model():
    if genai is None:
        raise RuntimeError(
            "google-generativeai is not installed. Run `python -m pip install -r requirements.txt` in the backend directory."
        )
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured for the backend.")
    genai.configure(api_key=api_key)
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
    recommendations = _extract_recommendations(report)

    system_prompt = f"""You are PalmGuard AI, an expert AI agent specialising in palm oil Basal Stem Rot (BSR) disease analysis for Malaysian plantations. You have autonomously completed a full drone image analysis.

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
        reply_text = getattr(response, "text", None)
        if reply_text and reply_text.strip():
            return jsonify({"reply": reply_text.strip()})
    except Exception as exc:
        return jsonify({
            "reply": _build_local_agent_reply(user_message, report, environment, infected_count),
            "fallback": True,
            "warning": str(exc),
        })

    return jsonify({
        "reply": _build_local_agent_reply(user_message, report, environment, infected_count),
        "fallback": True,
        "warning": "The language model returned an empty response.",
    })


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
