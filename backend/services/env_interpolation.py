import numpy as np

def cluster_infected_points(points, threshold=2):
    clusters = []

    for p in points:
        added = False
        for cluster in clusters:
            ref = cluster[0]

            if (
                abs(p["x"] - ref["x"]) < threshold
                and abs(p["y"] - ref["y"]) < threshold
            ):
                cluster.append(p)
                added = True
                break

        if not added:
            clusters.append([p])

    return clusters


def get_cluster_centers(clusters):
    centers = []

    for cluster in clusters:
        avg_x = sum(p["x"] for p in cluster) / len(cluster)
        avg_y = sum(p["y"] for p in cluster) / len(cluster)

        centers.append({"x": avg_x, "y": avg_y})

    return centers


def sample_environment(
    grid_coords, infected_points, get_env_func, image_width, image_height
):
    grid_size = len(grid_coords)
    ci = grid_size // 2
    cj = grid_size // 2

    centre_env = get_env_func(*grid_coords[ci][cj])

    return {(ci, cj): centre_env}

def interpolate_env(grid_coords, samples):
    grid_size = len(grid_coords)
    env_grid = [[None] * grid_size for _ in range(grid_size)]

    for i in range(grid_size):
        for j in range(grid_size):
            if (i, j) in samples:
                env_grid[i][j] = samples[(i, j)]
                continue

            total_weight = 0
            soil = humidity = temperature = 0

            for (si, sj), env in samples.items():
                dist_sq = (si - i) ** 2 + (sj - j) ** 2
                if dist_sq == 0:
                    dist_sq = 0.0001  
                w = 1 / dist_sq
                soil        += env["soil_moisture"] * w
                humidity    += env["humidity"] * w
                temperature += env["temperature"] * w
                total_weight += w

            env_grid[i][j] = {
                "soil_moisture": round(min(1, max(0, soil / total_weight)), 4),
                "humidity":      round(min(100, max(0, humidity / total_weight)), 4),
                "temperature":   round(min(40, max(15, temperature / total_weight)), 4),
            }

    return env_grid

def apply_infection_env_variation(env_grid, infected_points, image_width, image_height):
    if not infected_points:
        return env_grid

    grid_size = len(env_grid)
    adjusted = [[dict(cell) for cell in row] for row in env_grid]

    for i in range(grid_size):
        for j in range(grid_size):
            cell_center_x = ((j + 0.5) / grid_size) * image_width
            cell_center_y = ((i + 0.5) / grid_size) * image_height

            min_dist = min(
                ((pt["x"] - cell_center_x) ** 2 + (pt["y"] - cell_center_y) ** 2) ** 0.5
                for pt in infected_points
            )

            proximity = max(0.0, 1.0 - (min_dist / 220.0))
            row_wave = np.sin((i + 1) * 1.17 + (j + 1) * 0.63)
            col_wave = np.cos((i + 1) * 0.71 - (j + 1) * 1.11)

            temp_delta = (0.9 * proximity) + (0.18 * row_wave)
            humidity_delta = (5.5 * proximity) + (1.2 * col_wave)
            soil_delta = (0.035 * proximity) + (0.006 * row_wave)

            adjusted[i][j]["temperature"] = round(
                min(40, max(15, adjusted[i][j]["temperature"] + temp_delta)),
                4,
            )
            adjusted[i][j]["humidity"] = round(
                min(100, max(0, adjusted[i][j]["humidity"] + humidity_delta)),
                4,
            )
            adjusted[i][j]["soil_moisture"] = round(
                min(1, max(0, adjusted[i][j]["soil_moisture"] + soil_delta)),
                4,
            )

    return adjusted
