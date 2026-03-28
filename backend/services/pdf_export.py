import io
import os
from urllib.parse import urlparse

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


def _format_percent(value, digits=1):
    if value is None:
        return "N/A"
    return f"{float(value) * 100:.{digits}f}%"


def _format_value(value, digits=2):
    if value is None:
        return "N/A"
    return f"{float(value):.{digits}f}"


def _styles():
    styles = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ReportTitle",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#111827"),
            alignment=TA_LEFT,
            spaceAfter=10,
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#4B5563"),
            spaceAfter=8,
        ),
        "section": ParagraphStyle(
            "SectionHeading",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#111827"),
            spaceBefore=8,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#1F2937"),
        ),
        "small": ParagraphStyle(
            "Small",
            parent=styles["Normal"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#4B5563"),
        ),
    }


def _summary_table(report, styles):
    summary = report.get("summary", {})
    location = report.get("location", {})
    confidence_range = summary.get("detection_confidence_range") or {}

    rows = [
        ["Title", report.get("title", "Untitled report"), "Generated", report.get("generated_at", "N/A")],
        ["Risk band", summary.get("risk_band", "N/A"), "Average risk", _format_percent(summary.get("average_risk_score"))],
        ["Infected trees", str(summary.get("infected_tree_count", "N/A")), "High-risk areas", str(summary.get("high_risk_cells", "N/A"))],
        ["Latitude", str(location.get("lat", "N/A")), "Longitude", str(location.get("lon", "N/A"))],
        ["Altitude", f"{location.get('altitude', 'N/A')} m", "Weeks simulated", str(report.get("simulation", {}).get("weeks_simulated", "N/A"))],
        ["Avg confidence", _format_percent(summary.get("average_detection_confidence")), "Confidence range", f"{_format_percent(confidence_range.get('min'))} - {_format_percent(confidence_range.get('max'))}"],
        ["Avg temperature", f"{_format_value(summary.get('average_temperature'))} C", "Avg humidity", f"{_format_value(summary.get('average_humidity'))} %"],
        ["Avg soil moisture", _format_value(summary.get("average_soil_moisture"), 3), "Simulation trend", report.get("simulation", {}).get("trend", "N/A")],
    ]

    table = Table(rows, colWidths=[28 * mm, 58 * mm, 32 * mm, 58 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F9FAFB")),
                ("TEXTCOLOR", (0, 0), (-1, -1), colors.HexColor("#1F2937")),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEADING", (0, 0), (-1, -1), 12),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D1D5DB")),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#FCFCFD")]),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def _bullet_list(items, styles):
    if not items:
        return Paragraph("No data available.", styles["small"])

    bullets = [
        ListItem(Paragraph(str(item), styles["body"]), leftIndent=8)
        for item in items
    ]
    return ListFlowable(bullets, bulletType="bullet", start="circle", leftIndent=14)


def _top_risk_area_lines(report):
    lines = []
    for index, area in enumerate(report.get("top_risk_cells", []), start=1):
        row = (area.get("grid_position", {}).get("row", 0)) + 1
        col = (area.get("grid_position", {}).get("col", 0)) + 1
        lines.append(
            f"Area ({row},{col}): Lat {area.get('lat')}, Lon {area.get('lon')}, risk score = {_format_percent(area.get('risk_score'))}"
        )
    return lines


def _recommendation_lines(report):
    lines = []
    for entry in report.get("recommendation_areas", []):
        action = entry.get("action", "No action specified")
        areas = entry.get("areas", [])
        if len(areas) > 5:
            lines.append(action)
            continue

        area_labels = ", ".join(
            f"{area.get('area')} [Lat {area.get('lat')}, Lon {area.get('lon')}]"
            for area in areas
        )
        lines.append(f"{action} at {area_labels}" if area_labels else action)
    return lines


def _resolve_output_image_path(report):
    output_image = report.get("assets", {}).get("output_image")
    if not output_image:
        return None

    parsed = urlparse(output_image)
    image_name = os.path.basename(parsed.path)
    if not image_name:
        return None

    base_dir = os.path.dirname(os.path.dirname(__file__))
    candidate = os.path.join(base_dir, "output", image_name)
    return candidate if os.path.exists(candidate) else None


def build_report_pdf(report):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
    )
    styles = _styles()
    story = []

    story.append(Paragraph(report.get("title", "BSR Analysis Report"), styles["title"]))
    story.append(
        Paragraph(
            "Structured analysis report generated from image detection, heatmap scoring, and simulation output.",
            styles["subtitle"],
        )
    )

    output_image_path = _resolve_output_image_path(report)
    if output_image_path:
        story.append(Paragraph("Generated Heatmap", styles["section"]))
        story.append(Image(output_image_path, width=170 * mm, height=95 * mm))
        story.append(Spacer(1, 8))

    story.append(_summary_table(report, styles))

    story.append(Spacer(1, 10))
    story.append(Paragraph("Key Findings", styles["section"]))
    story.append(_bullet_list(report.get("key_findings", []), styles))

    story.append(Spacer(1, 10))
    story.append(Paragraph("Recommendations", styles["section"]))
    story.append(_bullet_list(_recommendation_lines(report), styles))

    story.append(PageBreak())

    story.append(Paragraph("Top Risk Areas", styles["section"]))
    story.append(_bullet_list(_top_risk_area_lines(report), styles))

    story.append(Spacer(1, 10))
    story.append(Paragraph("Simulation", styles["section"]))
    simulation = report.get("simulation", {})
    simulation_lines = [
        f"Weeks simulated: {simulation.get('weeks_simulated', 'N/A')}",
        f"Average risk at start: {_format_percent(simulation.get('average_risk_start'))}",
        f"Average risk at end: {_format_percent(simulation.get('average_risk_end'))}",
        f"Trend: {simulation.get('trend', 'N/A')}",
    ]
    story.append(_bullet_list(simulation_lines, styles))

    doc.build(story)
    buffer.seek(0)
    return buffer
