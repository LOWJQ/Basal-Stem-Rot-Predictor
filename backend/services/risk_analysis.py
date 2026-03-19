import numpy as np
import math

def generate_risk_map(infected_points, width, height):

    y_coords, x_coords = np.meshgrid(
        np.arange(height), np.arange(width), indexing='ij'
    )

    risk_map = np.zeros((height, width), dtype=np.float32)

    for point in infected_points:
        cx = float(point["x"])
        cy = float(point["y"])
        conf = float(point["conf"]) * 4.0

        dx = x_coords - cx
        dy = y_coords - cy
        dist = np.sqrt(dx**2 + dy**2)

        dist = np.maximum(dist, 1)

        influence = conf * (
            np.exp(-dist / 90) +
            0.3 * np.exp(-dist / 18)
        )

        risk_map += influence

    risk_map = np.clip(risk_map, 0, 1)

    return risk_map


def generate_heatmap_grid(risk_map, grid_size=6):

    h, w = risk_map.shape

    cell_h = h // grid_size
    cell_w = w // grid_size

    heatmap = []

    for i in range(grid_size):
        row = []
        for j in range(grid_size):

            y1 = i * cell_h
            y2 = (i + 1) * cell_h
            x1 = j * cell_w
            x2 = (j + 1) * cell_w

            cell = risk_map[y1:y2, x1:x2]

            score = float(np.percentile(cell, 90))

            if score > 0.6:
                level = "high"
            elif score > 0.3:
                level = "medium"
            else:
                level = "low"

            row.append({
                "x": (x1 + x2) / 2,
                "y": (y1 + y2) / 2,
                "risk": level,
                "risk_score": score
            })

        heatmap.append(row)

    return heatmap