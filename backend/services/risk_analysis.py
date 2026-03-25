import numpy as np

def classify_risk(r):
    if r < 0.33:
        return "low"
    elif r < 0.66:
        return "medium"
    else:
        return "high"

def calculate_env_risk(env):
    temp = env["temperature"]
    humidity = env["humidity"]
    soil = env["soil_moisture"]

    if temp < 20 or temp > 38:
        temp_score = 0
    elif 26 <= temp <= 32:
        temp_score = 1
    else:
        temp_score = 1 - abs(temp - 29) / 10
        temp_score = max(0, min(temp_score, 1))

    humidity_score = 1 - abs(humidity - 80) / 40
    humidity_score = max(0, min(humidity_score, 1))

    soil_score = (soil - 0.1) / (0.25 - 0.1)
    soil_score = max(0.1, min(soil_score, 1))

    env_risk = 0.2 * temp_score + 0.2 * humidity_score + 0.6 * soil_score

    return min(max(env_risk, 0), 1)


def generate_risk_map(infected_points, width, height, env_grid, grid_size=6):

    cell_h = max(1, height // grid_size)
    cell_w = max(1, width // grid_size)

    y_coords, x_coords = np.meshgrid(np.arange(height), np.arange(width), indexing="ij")

    risk_map = np.zeros((height, width), dtype=np.float32)

    for point in infected_points:
        cx = float(point["x"])
        cy = float(point["y"])
        conf = float(point["conf"]) * 4.0

        dx = x_coords - cx
        dy = y_coords - cy
        dist = np.sqrt(dx**2 + dy**2)

        dist = np.maximum(dist, 1)

        grid_y = np.clip((y_coords // cell_h).astype(int), 0, grid_size - 1)
        grid_x = np.clip((x_coords // cell_w).astype(int), 0, grid_size - 1)

        env_factor = np.zeros_like(risk_map)

        for i in range(grid_size):
            for j in range(grid_size):
                mask = (grid_y == i) & (grid_x == j)
                env = env_grid[i][j]
                env_factor[mask] = calculate_env_risk(env)

        influence = conf * (dist < 25).astype(float)

        risk_map += influence

    risk_map = np.clip(risk_map, 0, 1)

    return risk_map


def generate_heatmap_grid(
    risk_map, env_grid, infected_points, grid_coords, grid_size=6
):

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
                infection_score = float(np.max(cell))
                infection_score = max(0.0, min(infection_score, 1.0))

                env = env_grid[i][j]
                env_score = calculate_env_risk(env)

                score = max(infection_score, env_score * 0.3)

            score = max(0.0, min(score, 1.0))

            if score > 0.68:
                level = "high"
            elif score > 0.4:
                level = "medium"
            else:
                level = "low"

            x_center = (x1 + x2) / 2
            y_center = (y1 + y2) / 2

            coord = grid_coords[i][j]

            lat = coord[0]
            lon = coord[1]

            env = env_grid[i][j]

            detected_infected_trees = count_infected_in_cell(
                x_center, y_center, infected_points
            )

            factors = {
                "soil_moisture (m³/m³)": round(env["soil_moisture"], 3),
                "humidity (%)": round(env["humidity"], 3),
                "temperature (°C)": round(env["temperature"], 3),
            }

            near_infection = is_near_infection(x_center, y_center, infected_points)

            explanation = generate_explanation(
                factors=factors, risk_level=level, near_infection=near_infection
            )

            row.append(
                {
                    "lat": round(lat, 4),
                    "lon": round(lon, 4),
                    "risk": level,
                    "risk_score": round(score, 4),
                    "detected_infected_trees": detected_infected_trees,
                    "infection_nearby": near_infection,
                    "factors": factors,
                    "explanation": explanation,
                }
            )

        heatmap.append(row)

        flat_heatmap = []
        for i, row in enumerate(heatmap):
            for j, cell in enumerate(row):
                risk = float(cell["risk_score"])
                flat_heatmap.append({
                    "x": j,
                    "y": i,
                    "risk": risk,
                    "risk_level": classify_risk(risk),
                    "factors": dict(cell["factors"])
                })

    return heatmap, flat_heatmap


def generate_explanation(factors, risk_level, near_infection=False):
    reasons = []
    actions = []

    humidity = factors.get("humidity (%)", 0)
    soil = factors.get("soil_moisture (m³/m³)", 0)
    temp = factors.get("temperature (°C)", 0)

    if soil > 0.2:
        reasons.append("High soil moisture promotes fungal growth")

    if humidity > 80:
        reasons.append("High humidity favors disease spread")

    if temp > 27:
        reasons.append("Warm temperature accelerates pathogen activity")

    if near_infection:
        reasons.append("Infection detected within nearby area")

    if risk_level == "low":
        reasons.append("Environmental conditions are less favorable for disease")

    if soil > 0.2:
        actions.append("Improve drainage in the plantation")

    if humidity > 80:
        actions.append("Increase spacing or airflow between trees")

    if near_infection:
        actions.append("Remove or isolate infected trees immediately")

    if risk_level == "high":
        actions.append("Apply fungicide treatment")

    if risk_level == "medium":
        actions.append("Monitor the area closely for changes")

    if risk_level == "low":
        actions.append("Maintain current plantation practices")

    if not reasons:
        reasons.append("No significant risk factors detected")

    return {"reasons": list(set(reasons)), "actions": list(set(actions))}


def is_near_infection(x, y, infected_points, threshold=100):
    for pt in infected_points:
        dx = x - pt["x"]
        dy = y - pt["y"]
        if (dx**2 + dy**2) ** 0.5 < threshold:
            return True
    return False


def count_infected_in_cell(x_center, y_center, infected_points, threshold=80):
    count = 0
    for pt in infected_points:
        dx = x_center - pt["x"]
        dy = y_center - pt["y"]
        dist = (dx**2 + dy**2) ** 0.5

        if dist < threshold:
            count += 1

    return count
