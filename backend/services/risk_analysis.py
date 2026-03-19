def calculate_risk(x, y, infected_points):

    if len(infected_points) == 0:
        return "Low", 0.0, None

    total_risk = 0
    min_dist = float("inf")

    for point in infected_points:
        dx = x - point["x"]
        dy = y - point["y"]
        dist = (dx**2 + dy**2) ** 0.5

        dist = float(max(dist, 20))

        if dist < min_dist:
            min_dist = dist

        influence = point["conf"] / dist
        total_risk += influence

    score = 1 - (1 / (1 + total_risk))

    if score > 0.66:
        level = "High"
    elif score > 0.33:
        level = "Medium"
    else:
        level = "Low"

    return level, score, min_dist


def generate_heatmap(infected_points, width, height, grid_size=6):
    heatmap = []

    cell_w = width / grid_size
    cell_h = height / grid_size

    for i in range(grid_size):
        row = []
        for j in range(grid_size):

            x = (j + 0.5) * cell_w
            y = (i + 0.5) * cell_h

            total_risk = 0
            min_dist = float("inf")

            for point in infected_points:
                dx = x - point["x"]
                dy = y - point["y"]
                dist = (dx**2 + dy**2) ** 0.5

                dist = float(max(dist, 20))

                influence = 1 / dist
                total_risk += influence

                if dist < min_dist:
                    min_dist = dist

            score = 1 - (1 / (1 + total_risk))

            if score < 0.3:
                level = "low"
            elif score < 0.6:
                level = "medium"
            else:
                level = "high"

            row.append({
                "x": x,
                "y": y,
                "risk": level,
                "risk_score": score,
                "distance": min_dist if min_dist != float("inf") else None
            })

        heatmap.append(row)

    return heatmap