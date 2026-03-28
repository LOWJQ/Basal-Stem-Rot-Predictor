import random
import cv2
import numpy as np
import logging

from services.risk_analysis import get_risk_label

logger = logging.getLogger(__name__)


def simulate_future_heatmap(heatmap, weeks=1):
    rows = len(heatmap)
    cols = len(heatmap[0])

    future = []
    for row in heatmap:
        new_row = []
        for cell in row:
            new_cell = {
                "risk_score": cell["risk_score"],
                "risk": cell["risk"],
                "detected_infected_trees": cell.get("detected_infected_trees", 0),
                "factors": {
                    "humidity": cell["factors"]["humidity"],
                    "soil_moisture": cell["factors"]["soil_moisture"],
                    "temperature": cell["factors"]["temperature"],
                }
            }
            for key in cell:
                if key not in new_cell:
                    new_cell[key] = cell[key]
            new_row.append(new_cell)
        future.append(new_row)

    total_change = 0.0
    cells_changed = 0

    for i in range(rows):
        for j in range(cols):
            cell = heatmap[i][j]
            base_risk = cell["risk_score"]

            neighbour_risks = []
            max_neighbour_risk = 0.0
            nearby_infections = 0

            for di in range(-1, 2):
                for dj in range(-1, 2):
                    if di == 0 and dj == 0:
                        continue
                    ni, nj = i + di, j + dj
                    if 0 <= ni < rows and 0 <= nj < cols:
                        neighbour = heatmap[ni][nj]
                        risk = neighbour["risk_score"]
                        neighbour_risks.append(risk)
                        max_neighbour_risk = max(max_neighbour_risk, risk)
                        
                        if neighbour.get("detected_infected_trees", 0) > 0:
                            nearby_infections += 1

            avg_neighbour = sum(neighbour_risks) / len(neighbour_risks) if neighbour_risks else 0

            humidity = cell["factors"]["humidity"]
            soil = cell["factors"]["soil_moisture"]
            temp = cell["factors"]["temperature"]

            env_factor = 1.0
            if 26 <= temp <= 32:
                env_factor += 0.06
            if humidity > 80:
                env_factor += 0.06
            if soil > 0.20:
                env_factor += 0.1

            own_infected = cell.get("detected_infected_trees", 0)

            if own_infected > 0:
                self_boost = 0.014 * env_factor * min(own_infected, 3)
            else:
                self_boost = 0.0

            if nearby_infections > 0:
                infection_spread = 0.011 * min(nearby_infections, 3) * env_factor
            else:
                infection_spread = 0.0

            risk_diffusion = (avg_neighbour - base_risk) * 0.1 * env_factor

            # Higher-risk cells can still grow, but each step should feel gradual.
            if base_risk >= 0.75:
                growth_resistance = 0.55
            elif base_risk >= 0.5:
                growth_resistance = 0.72
            else:
                growth_resistance = 1.0

            score = base_risk + (self_boost + infection_spread + risk_diffusion) * growth_resistance

            # Cap weekly change so the simulation reads as progressive rather than explosive.
            max_step_up = 0.055 if own_infected > 0 else 0.038
            max_step_down = 0.02
            score = min(score, base_risk + max_step_up)
            score = max(score, base_risk - max_step_down)

            score = max(0.0, min(1.0, score))

            change = abs(score - base_risk)
            if change > 0.001:
                cells_changed += 1
                total_change += change

            label = get_risk_label(score)

            future[i][j]["risk_score"] = round(score, 4)
            future[i][j]["risk"] = label
            future[i][j]["detected_infected_trees"] = own_infected

    avg_change = total_change / (rows * cols) if (rows * cols) > 0 else 0
    logger.info(f"Simulation step: {cells_changed}/{rows*cols} cells changed, avg change: {avg_change:.6f}")

    return future

def simulate_future_steps(initial_heatmap, steps=12):
    maps = []
    current = initial_heatmap

    logger.info(
        f"Starting simulation with {len(current)}x{len(current[0])} grid for {steps} steps"
    )

    initial_avg = np.mean([[cell["risk_score"] for cell in row] for row in current])
    logger.info(f"Initial average risk: {initial_avg:.4f}")

    for step_idx in range(steps):
        current = simulate_future_heatmap(current, weeks=1)

        current_avg = np.mean([[cell["risk_score"] for cell in row] for row in current])
        logger.info(f"Step {step_idx + 1}: average risk: {current_avg:.4f}")

        step_copy = []
        for row in current:
            new_row = []
            for cell in row:
                new_cell = {
                    "risk_score": cell["risk_score"],
                    "risk": cell["risk"],
                    "detected_infected_trees": cell.get("detected_infected_trees", 0),
                    "factors": {
                        "humidity": cell["factors"]["humidity"],
                        "soil_moisture": cell["factors"]["soil_moisture"],
                        "temperature": cell["factors"]["temperature"],
                    },
                }
                for key in cell:
                    if key not in new_cell:
                        new_cell[key] = cell[key]
                new_row.append(new_cell)
            step_copy.append(new_row)

        maps.append(step_copy)

    return maps


def grid_to_risk_map(heatmap_grid, width, height):
    rows = len(heatmap_grid)
    cols = len(heatmap_grid[0])

    grid_array = np.zeros((rows, cols))

    for i in range(rows):
        for j in range(cols):
            grid_array[i, j] = heatmap_grid[i][j]["risk_score"]

    risk_map = cv2.resize(grid_array, (width, height), interpolation=cv2.INTER_LINEAR)
    
    noise = np.random.normal(0, 0.02, risk_map.shape)
    risk_map = np.clip(risk_map + noise, 0, 1)

    return risk_map
