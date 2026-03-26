import random
import cv2
import numpy as np

from services.risk_analysis import get_risk_label


def simulate_future_heatmap(heatmap, weeks=1):
    rows = len(heatmap)
    cols = len(heatmap[0])

    future = [
        [{**cell, "factors": dict(cell["factors"])} for cell in row] for row in heatmap
    ]

    for i in range(rows):
        for j in range(cols):
            cell = heatmap[i][j]
            base_risk = cell["risk_score"]

            neighbour_risks = []
            neighbour_has_infection = False

            for di in [-1, 0, 1]:
                for dj in [-1, 0, 1]:
                    if di == 0 and dj == 0:
                        continue
                    ni, nj = i + di, j + dj
                    if 0 <= ni < rows and 0 <= nj < cols:
                        neighbour = heatmap[ni][nj]
                        neighbour_risks.append(neighbour["risk_score"])

                        if neighbour.get("detected_infected_trees", 0) > 0:
                            neighbour_has_infection = True

            avg_neighbour = (
                sum(neighbour_risks) / len(neighbour_risks) if neighbour_risks else 0
            )

            humidity = cell["factors"]["humidity (%)"]
            soil = cell["factors"]["soil_moisture (m³/m³)"]
            temp = cell["factors"]["temperature (°C)"]

            conductivity = 0.0
            if 26 <= temp <= 32:
                conductivity += 0.3
            if humidity > 80:
                conductivity += 0.3
            if soil > 0.20:
                conductivity += 0.4

            own_infected = cell.get("detected_infected_trees", 0)

            if own_infected > 0:
                infection_source_pressure = 0.18 * conductivity * min(own_infected, 5)
            elif neighbour_has_infection:
                infection_source_pressure = 0.12 * conductivity
            else:
                infection_source_pressure = 0.0

            spread_pressure = avg_neighbour * conductivity * 0.15
            score = base_risk + spread_pressure + infection_source_pressure

            if avg_neighbour < 0.2 and conductivity < 0.3 and own_infected == 0:
                score *= 0.97

            score = max(0.0, min(1.0, score))

            label = get_risk_label(score)

            future[i][j]["risk_score"] = round(score, 4)
            future[i][j]["risk"] = label

            future[i][j]["detected_infected_trees"] = own_infected

    return future


def simulate_future_steps(initial_heatmap, steps=11):
    maps = []
    current = initial_heatmap

    for _ in range(steps):
        current = simulate_future_heatmap(current, weeks=1)
        maps.append(current)

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
