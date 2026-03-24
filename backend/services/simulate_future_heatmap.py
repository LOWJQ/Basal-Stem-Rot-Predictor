import copy
import random
import cv2
import numpy as np


def simulate_future_heatmap(heatmap, weeks=1):
    rows = len(heatmap)
    cols = len(heatmap[0])

    future = copy.deepcopy(heatmap)

    for i in range(rows):
        for j in range(cols):
            cell = heatmap[i][j]
            base_risk = cell["risk_score"]

            neighbors = []
            for dx in [-1, 0, 1]:
                for dy in [-1, 0, 1]:
                    ni, nj = i + dx, j + dy
                    if 0 <= ni < rows and 0 <= nj < cols:
                        if not (dx == 0 and dy == 0):
                            neighbors.append(heatmap[ni][nj])

            infection_pressure = 0
            for n in neighbors:
                if n["detected_infected_trees"] > 0:
                    infection_pressure += 0.88
                elif n["risk"] == "high":
                    infection_pressure += n["risk_score"] * 0.68

            humidity = cell["factors"]["humidity (%)"]
            soil = cell["factors"]["soil_moisture (m³/m³)"]

            if cell["detected_infected_trees"] > 0:
                base_risk += 0.2

            env_factor = 0
            if humidity > 80:
                env_factor += 0.05
            if soil > 0.22:
                env_factor += 0.05

            time_factor = 0.005 * weeks + 0.02 * infection_pressure

            has_infection_source = (
                cell["detected_infected_trees"] > 0 or infection_pressure > 0
            )

            if has_infection_source:
                future_risk = (
                    base_risk + (infection_pressure * 0.01) + env_factor + time_factor
                )
            else:
                future_risk = base_risk + env_factor * 0.1

            noise = random.uniform(-0.01, 0.01)
            future_risk += noise
            future_risk = max(0, min(future_risk, 1.0))

            if future_risk > 0.68:
                risk_label = "high"
            elif future_risk > 0.4:
                risk_label = "medium"
            else:
                risk_label = "low"

            future[i][j]["risk_score"] = future_risk
            future[i][j]["risk"] = risk_label

    risk_array = np.array([[cell["risk_score"] for cell in row] for row in future])
    risk_array = cv2.GaussianBlur(risk_array, (3, 3), 0.3)

    for i in range(rows):
        for j in range(cols):
            future[i][j]["risk_score"] = float(risk_array[i][j])

    return future


def simulate_future_steps(initial_heatmap, steps=11):
    maps = []
    current = copy.deepcopy(initial_heatmap)

    maps.append(copy.deepcopy(current))

    for i in range(steps):
        current = simulate_future_heatmap(current, weeks=i + 1)
        maps.append(copy.deepcopy(current))

    return maps


def grid_to_risk_map(heatmap_grid, width, height):
    rows = len(heatmap_grid)
    cols = len(heatmap_grid[0])

    grid_array = np.zeros((rows, cols))

    for i in range(rows):
        for j in range(cols):
            grid_array[i, j] = heatmap_grid[i][j]["risk_score"]

    risk_map = cv2.resize(grid_array, (width, height), interpolation=cv2.INTER_CUBIC)

    return risk_map
