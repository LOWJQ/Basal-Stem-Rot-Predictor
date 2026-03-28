import io

from openpyxl import Workbook
from openpyxl.styles import Font


def _format_percent(value, digits=1):
    if value is None:
        return None
    return round(float(value) * 100, digits)


def _area_label(row, col):
    return f"area({row + 1},{col + 1})"


def _map_point_to_area(point, image_size, grid_size=6):
    width = float((image_size or {}).get("width") or 0)
    height = float((image_size or {}).get("height") or 0)

    if width <= 0 or height <= 0:
        return None

    cell_w = max(1.0, width / grid_size)
    cell_h = max(1.0, height / grid_size)

    x = float(point.get("x", 0))
    y = float(point.get("y", 0))

    col = min(grid_size - 1, max(0, int(x / cell_w)))
    row = min(grid_size - 1, max(0, int(y / cell_h)))
    return row, col


def _build_area_confidence_lookup(infected_points, image_size):
    grouped = {}

    for point in infected_points or []:
        area = _map_point_to_area(point, image_size)
        if area is None:
            continue

        confidence = point.get("conf")
        if confidence is None:
            continue

        grouped.setdefault(area, []).append(float(confidence))

    return grouped


def _cell_lookup(flat_heatmap):
    return {
        (int(cell.get("y", 0)), int(cell.get("x", 0))): cell
        for cell in (flat_heatmap or [])
    }


def _autosize_columns(sheet):
    for column_cells in sheet.columns:
        max_length = 0
        column_letter = column_cells[0].column_letter
        for cell in column_cells:
            value = "" if cell.value is None else str(cell.value)
            max_length = max(max_length, len(value))
        sheet.column_dimensions[column_letter].width = min(max(max_length + 2, 12), 36)


def _write_headers(sheet, headers):
    sheet.append(headers)
    for cell in sheet[1]:
        cell.font = Font(bold=True)


def build_report_excel(payload, report=None):
    workbook = Workbook()
    areas_sheet = workbook.active
    areas_sheet.title = "Areas"
    trees_sheet = workbook.create_sheet("Infected Trees")

    flat_heatmap = (payload or {}).get("heatmap") or []
    infected_points = (payload or {}).get("infected_points") or []
    image_size = (payload or {}).get("image_size") or {}

    area_confidences = _build_area_confidence_lookup(infected_points, image_size)
    cell_by_area = _cell_lookup(flat_heatmap)

    _write_headers(
        areas_sheet,
        [
            "Area",
            "Latitude",
            "Longitude",
            "Risk Level",
            "Risk Score (%)",
            "Temperature (C)",
            "Humidity (%)",
            "Soil Moisture",
            "Infected Trees in Area",
            "Nearby Infected Tree",
            "Avg Confidence in Area (%)",
        ],
    )

    for cell in sorted(flat_heatmap, key=lambda item: (item.get("y", 0), item.get("x", 0))):
        area_key = (int(cell.get("y", 0)), int(cell.get("x", 0)))
        confidences = area_confidences.get(area_key, [])
        avg_confidence = (
            round(sum(confidences) / len(confidences) * 100, 1)
            if confidences
            else None
        )

        areas_sheet.append(
            [
                _area_label(area_key[0], area_key[1]),
                cell.get("lat"),
                cell.get("lon"),
                cell.get("risk"),
                _format_percent(cell.get("risk_score")),
                cell.get("factors", {}).get("temperature"),
                cell.get("factors", {}).get("humidity"),
                cell.get("factors", {}).get("soil_moisture"),
                cell.get("detected_infected_trees"),
                "Yes" if cell.get("infection_nearby") else "No",
                avg_confidence,
            ]
        )

    _write_headers(
        trees_sheet,
        [
            "Tree",
            "Area",
            "Area Latitude",
            "Area Longitude",
            "Confidence (%)",
            "Pixel X",
            "Pixel Y",
        ],
    )

    for index, point in enumerate(infected_points, start=1):
        area = _map_point_to_area(point, image_size)
        cell = cell_by_area.get(area) if area is not None else None
        trees_sheet.append(
            [
                f"Tree {index}",
                _area_label(area[0], area[1]) if area is not None else "N/A",
                cell.get("lat") if cell else None,
                cell.get("lon") if cell else None,
                _format_percent(point.get("conf")),
                round(float(point.get("x", 0)), 1),
                round(float(point.get("y", 0)), 1),
            ]
        )

    _autosize_columns(areas_sheet)
    _autosize_columns(trees_sheet)

    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return buffer
