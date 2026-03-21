import numpy as np

def calculate_env_risk(env):
    temp = env["temperature"]
    humidity = env["humidity"] / 100.0
    soil = env["soil_moisture"]

    temp_score = min(max((temp - 24) / 10, 0), 1)

    env_risk = (
        0.3 * temp_score +
        0.4 * humidity +
        0.3 * soil
    )

    return min(max(env_risk, 0), 1)

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

def generate_heatmap_grid(risk_map, env_grid, grid_size=6):

    h, w = risk_map.shape

    cell_h = max(1, h // grid_size)
    cell_w = max(1, w // grid_size)

    heatmap = []

    for i in range(grid_size):
        row = []
        for j in range(grid_size):

            y1 = i * cell_h
            y2 = (i + 1) * cell_h if i < grid_size - 1 else h
            x1 = j * cell_w
            x2 = (j + 1) * cell_w if j < grid_size - 1 else w

            cell = risk_map[y1:y2, x1:x2]

            if cell.size == 0:
                score = 0.0
            else:
                infection_score = float(np.percentile(cell, 90))
                infection_score = max(0.0, min(infection_score, 1.0))

                env = env_grid[i][j]
                env_score = calculate_env_risk(env)

                score = (
                    0.6 * infection_score +
                    0.4 * env_score
                )

            score = max(0.0, min(score, 1.0))

            if score > 0.65:
                level = "high"
            elif score > 0.35:
                level = "medium"
            else:
                level = "low"

            env = env_grid[i][j]

            row.append({
                "x": (x1 + x2) / 2,
                "y": (y1 + y2) / 2,
                "risk": level,
                "risk_score": score,
                "factors": {
                    "soil_moisture": env["soil_moisture"],
                    "humidity": env["humidity"] / 100.0,  
                    "temperature": env["temperature"]
                }
            })

        heatmap.append(row)

    return heatmap