import json
import time
import os
from datetime import datetime

try:
    from google import genai
except ImportError:
    genai = None
from flask import Blueprint, Response, jsonify, request, stream_with_context
from services.database import get_plot_history

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


def _safe_json(value):
    try:
        return json.dumps(value, ensure_ascii=False)
    except TypeError:
        return json.dumps(str(value), ensure_ascii=False)


def _format_scan_timestamp(value):
    if not value:
        return "Unknown date"
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).strftime("%Y-%m-%d")
    except ValueError:
        return str(value)


def _build_scan_summary_entry(scan):
    payload = scan.get("payload") or {}
    report = payload.get("report") or {}
    summary = report.get("summary") or {}
    key_findings = report.get("key_findings") or []

    findings_text = "; ".join(str(item) for item in key_findings[:3]) or "No major findings recorded."

    return {
        "scan_date": _format_scan_timestamp(scan.get("timestamp")),
        "risk_score": summary.get("average_risk_score", scan.get("avg_risk_score")),
        "infected_tree_count": summary.get("infected_tree_count", scan.get("infected_count", 0)),
        "key_findings": findings_text,
    }


def _build_plot_scan_history(*, current_scan, device_id, history_id=None):
    report = (current_scan or {}).get("report") or {}
    location = report.get("location") or {}
    lat = location.get("lat")
    lon = location.get("lon")

    plot_scans = get_plot_history(
        lat=lat,
        lon=lon,
        device_id=device_id,
        limit=20,
        include_payload=True,
        exclude_scan_id=history_id,
    )

    return [_build_scan_summary_entry(scan) for scan in plot_scans]


def _trim_conversation(conversation, user_message, limit=8):
    if not isinstance(conversation, list):
        conversation = []

    trimmed = []
    for entry in conversation:
        role = str((entry or {}).get("role") or "").strip().lower()
        text = str((entry or {}).get("text") or "").strip()
        if role not in {"user", "agent"} or not text:
            continue
        trimmed.append({"role": role, "text": text})

    if trimmed and trimmed[-1]["role"] == "user" and trimmed[-1]["text"] == user_message:
        trimmed = trimmed[:-1]

    return trimmed[-limit:]


def _build_current_scan_context(current_scan):
    if not isinstance(current_scan, dict):
        return {}

    return {
        "history_id": current_scan.get("history_id"),
        "title": current_scan.get("title"),
        "image_size": current_scan.get("image_size"),
        "infected_points": current_scan.get("infected_points"),
        "heatmap": current_scan.get("heatmap"),
        "heatmap_grid": current_scan.get("heatmap_grid"),
        "grid_coordinates": current_scan.get("grid_coordinates"),
        "environment_summary": current_scan.get("environment_summary"),
        "report": current_scan.get("report"),
        "suggested_questions": current_scan.get("suggested_questions"),
    }


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
            "google-genai is not installed. Run `pip install google-genai` in the backend directory."
        )
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured for the backend.")
    client = genai.Client(api_key=api_key)
    return client


@agent_bp.route("/agent-chat", methods=["POST"])
def agent_chat():
    body = request.get_json(silent=True) or {}
    device_id = request.headers.get("X-Device-Id", "unknown")
    user_message = body.get("message", "").strip()
    report = body.get("report") or {}
    environment = body.get("environment_summary") or {}
    infected_count = int(body.get("infected_count", 0))
    current_scan = body.get("current_scan") or {}
    conversation = body.get("conversation") or []
    history_id = body.get("history_id")

    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    if current_scan:
        report = current_scan.get("report") or report
        environment = current_scan.get("environment_summary") or environment
        current_infected_points = current_scan.get("infected_points")
        if isinstance(current_infected_points, list):
            infected_count = len(current_infected_points)
        history_id = current_scan.get("history_id", history_id)

    summary = report.get("summary") or {}
    key_findings = report.get("key_findings") or []
    recommendations = _extract_recommendations(report)
    plot_scan_history = _build_plot_scan_history(
        current_scan=current_scan,
        device_id=device_id,
        history_id=history_id,
    )
    recent_conversation = _trim_conversation(conversation, user_message, limit=8)
    current_scan_context = _build_current_scan_context(current_scan)

    system_prompt = f"""You are PalmGuard AI, an expert assistant for palm oil Basal Stem Rot (BSR) monitoring.

Use three context layers only:
1. Summarised past scans for this plot.
2. Only the recent conversation messages shown below.
3. The full structured data for the current scan.

SUMMARISED PAST SCANS FOR THIS PLOT:
{_safe_json(plot_scan_history)}

RECENT CONVERSATION (LAST {len(recent_conversation)} MESSAGES):
{_safe_json(recent_conversation)}

FULL CURRENT SCAN DATA:
{_safe_json(current_scan_context or {
    "infected_trees_detected": infected_count,
    "environment_summary": environment,
    "report_summary": summary,
    "key_findings": key_findings,
    "recommended_actions": recommendations,
})}

INSTRUCTIONS:
- Answer as if you remember the plot history, but rely only on the context provided above.
- Focus on the current scan unless the user asks for comparison or trend.
- Be direct, concise, and actionable.
- Use plain English. No markdown headers. Max 3 short paragraphs.
- If asked something unrelated to this scan or palm oil disease, politely redirect."""

    try:
        client = get_gemini_model()
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=f"{system_prompt}\n\nUser: {user_message}"
        )
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
