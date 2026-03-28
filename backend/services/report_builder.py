from datetime import datetime


def _risk_range_label(score):
    if score >= 0.68:
        return "High risk"
    if score >= 0.4:
        return "Medium risk"
    return "Low risk"


def _average_detection_confidence(infected_points):
    if not infected_points:
        return None

    confidences = [
        float(point["conf"])
        for point in infected_points
        if point.get("conf") is not None
    ]

    if not confidences:
        return None

    return round(sum(confidences) / len(confidences), 4)


def _confidence_range(infected_points):
    if not infected_points:
        return None

    confidences = [
        float(point["conf"])
        for point in infected_points
        if point.get("conf") is not None
    ]

    if not confidences:
        return None

    return {
        "min": round(min(confidences), 4),
        "max": round(max(confidences), 4),
    }


def _detected_areas(infected_points, image_width, image_height, grid_size=6):
    if not infected_points or not image_width or not image_height:
        return []

    cell_w = max(1, image_width / grid_size)
    cell_h = max(1, image_height / grid_size)

    detected = []
    seen = set()

    for point in infected_points:
        x = float(point.get("x", 0))
        y = float(point.get("y", 0))

        col = min(grid_size - 1, max(0, int(x / cell_w)))
        row = min(grid_size - 1, max(0, int(y / cell_h)))
        key = (row, col)

        if key in seen:
            continue

        seen.add(key)
        detected.append(f"area({row + 1},{col + 1})")

    return detected


def _top_risk_cells(flat_heatmap, limit=3):
    sorted_cells = sorted(
        flat_heatmap,
        key=lambda cell: cell.get("risk_score", 0),
        reverse=True,
    )

    top_cells = []
    for cell in sorted_cells[:limit]:
        top_cells.append(
            {
                "grid_position": {"row": cell["y"], "col": cell["x"]},
                "risk": cell["risk"],
                "risk_score": round(float(cell["risk_score"]), 4),
                "lat": cell["lat"],
                "lon": cell["lon"],
                "detected_infected_trees": cell["detected_infected_trees"],
                "infection_nearby": cell["infection_nearby"],
                "actions": cell.get("explanation", {}).get("actions", []),
            }
        )

    return top_cells


def _build_key_findings(flat_heatmap, infected_points, environment_summary):
    findings = []

    infected_count = len(infected_points)
    if infected_count:
        findings.append(f"{infected_count} infected tree(s) were detected in the submitted image.")
    else:
        findings.append("No infected trees were directly detected in the submitted image.")

    high_cells = sum(1 for cell in flat_heatmap if cell["risk"] == "high")
    if high_cells:
        findings.append(f"{high_cells} grid cell(s) were classified as high risk.")

    avg_humidity = environment_summary.get("avg_humidity")
    if avg_humidity is not None and avg_humidity >= 80:
        findings.append(
            f"Average humidity is elevated at {avg_humidity:.1f}%, which supports disease activity."
        )

    avg_soil = environment_summary.get("avg_soil_moisture")
    if avg_soil is not None and avg_soil >= 0.2:
        findings.append(
            f"Average soil moisture is high at {avg_soil:.3f}, increasing fungal persistence risk."
        )

    return findings[:4]


def _build_recommendations(flat_heatmap):
    recommendations = []
    seen = set()

    for cell in sorted(flat_heatmap, key=lambda item: item.get("risk_score", 0), reverse=True):
        for action in cell.get("explanation", {}).get("actions", []):
            if action not in seen:
                seen.add(action)
                recommendations.append(action)
        if len(recommendations) >= 5:
            break

    return recommendations[:5]


def _build_recommendation_areas(flat_heatmap):
    grouped = {}

    for cell in sorted(flat_heatmap, key=lambda item: item.get("risk_score", 0), reverse=True):
        actions = cell.get("explanation", {}).get("actions", [])
        if not actions:
            continue

        area_entry = {
            "area": f"area({cell['y'] + 1},{cell['x'] + 1})",
            "lat": cell["lat"],
            "lon": cell["lon"],
            "risk": cell["risk"],
            "risk_score": round(float(cell["risk_score"]), 4),
            "detected_infected_trees": cell["detected_infected_trees"],
            "infection_nearby": cell["infection_nearby"],
        }

        for action in actions:
            grouped.setdefault(action, []).append(area_entry)

    recommendation_areas = []
    for action, areas in grouped.items():
        recommendation_areas.append(
            {
                "action": action,
                "areas": areas,
            }
        )

    return recommendation_areas


def _build_simulation_summary(simulation_steps):
    if not simulation_steps:
        return {
            "weeks_simulated": 0,
            "average_risk_start": None,
            "average_risk_end": None,
            "trend": "No simulation data available.",
        }

    start_grid = simulation_steps[0]
    end_grid = simulation_steps[-1]

    start_scores = [cell["risk_score"] for row in start_grid for cell in row]
    end_scores = [cell["risk_score"] for row in end_grid for cell in row]

    start_avg = round(sum(start_scores) / len(start_scores), 4) if start_scores else None
    end_avg = round(sum(end_scores) / len(end_scores), 4) if end_scores else None

    if start_avg is None or end_avg is None:
        trend = "No simulation data available."
    elif end_avg > start_avg + 0.03:
        trend = "Risk is projected to increase over the simulation period."
    elif end_avg < start_avg - 0.03:
        trend = "Risk is projected to ease slightly over the simulation period."
    else:
        trend = "Risk is projected to remain relatively stable over the simulation period."

    return {
        "weeks_simulated": len(simulation_steps) - 1,
        "average_risk_start": start_avg,
        "average_risk_end": end_avg,
        "trend": trend,
    }


def build_report(
    *,
    report_id,
    title,
    lat,
    lon,
    altitude,
    infected_points,
    flat_heatmap,
    environment_summary,
    simulation_steps,
    output_image,
    image_width,
    image_height,
    generated_at=None,
):
    generated_at = generated_at or datetime.utcnow().isoformat()

    risk_scores = [float(cell["risk_score"]) for cell in flat_heatmap]
    avg_risk_score = round(sum(risk_scores) / len(risk_scores), 4) if risk_scores else 0.0

    return {
        "report_id": report_id,
        "title": title,
        "generated_at": generated_at,
        "location": {
            "lat": lat,
            "lon": lon,
            "altitude": altitude,
        },
        "summary": {
            "infected_tree_count": len(infected_points),
            "average_risk_score": avg_risk_score,
            "risk_band": _risk_range_label(avg_risk_score),
            "high_risk_cells": sum(1 for cell in flat_heatmap if cell["risk"] == "high"),
            "medium_risk_cells": sum(1 for cell in flat_heatmap if cell["risk"] == "medium"),
            "low_risk_cells": sum(1 for cell in flat_heatmap if cell["risk"] == "low"),
            "average_temperature": environment_summary.get("avg_temperature"),
            "average_humidity": environment_summary.get("avg_humidity"),
            "average_soil_moisture": environment_summary.get("avg_soil_moisture"),
            "average_detection_confidence": _average_detection_confidence(infected_points),
            "detection_confidence_range": _confidence_range(infected_points),
            "detected_areas": _detected_areas(
                infected_points,
                image_width,
                image_height,
            ),
        },
        "key_findings": _build_key_findings(
            flat_heatmap,
            infected_points,
            environment_summary,
        ),
        "recommendations": _build_recommendations(flat_heatmap),
        "recommendation_areas": _build_recommendation_areas(flat_heatmap),
        "top_risk_cells": _top_risk_cells(flat_heatmap),
        "simulation": _build_simulation_summary(simulation_steps),
        "assets": {
            "output_image": output_image,
        },
    }
