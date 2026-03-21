import numpy as np

def cluster_infected_points(points, threshold=2):
    clusters = []

    for p in points:
        added = False
        for cluster in clusters:
            ref = cluster[0]

            if abs(p["x"] - ref["x"]) < threshold and abs(p["y"] - ref["y"]) < threshold:
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

def sample_environment(grid_coords, infected_points, get_env_func, image_width, image_height):

    grid_size = len(grid_coords)

    samples = {}

    center = grid_coords[grid_size//2][grid_size//2]
    samples[(grid_size//2, grid_size//2)] = get_env_func(*center)

    corners = [(0,0), (0,grid_size-1), (grid_size-1,0), (grid_size-1,grid_size-1)]
    for (i,j) in corners:
        samples[(i,j)] = get_env_func(*grid_coords[i][j])

    clusters = cluster_infected_points(infected_points)

    centers = get_cluster_centers(clusters)

    for p in centers:
        i = int((p["y"] / image_height) * grid_size)
        j = int((p["x"] / image_width) * grid_size)

        i = max(0, min(grid_size - 1, i))
        j = max(0, min(grid_size - 1, j))

        if (i, j) not in samples:
          samples[(i, j)] = get_env_func(*grid_coords[i][j])

    return samples

def interpolate_env(grid_coords, samples):

    grid_size = len(grid_coords)
    env_grid = [[None]*grid_size for _ in range(grid_size)]

    for i in range(grid_size):
        for j in range(grid_size):

            if (i,j) in samples:
                env_grid[i][j] = samples[(i,j)]
                continue

            nearest = min(samples.keys(), key=lambda k: (k[0]-i)**2 + (k[1]-j)**2)
            base = samples[nearest]

            min_dist = min((k[0]-i)**2 + (k[1]-j)**2 for k in samples.keys())
            distance_factor = 1 / (1 + min_dist)

            variation = ((i + j) % 3) * 0.02

            soil = base["soil_moisture"] * (1 + 0.2 * distance_factor)
            soil = soil + variation

            soil = min(1, max(0, soil))

            humidity = base["humidity"] * (1 + 0.1 * distance_factor)
            humidity = humidity + variation * 10 
            humidity = min(100, max(0, humidity))

            temperature = base["temperature"] * (1 - 0.05 * distance_factor)
            temperature = temperature + variation * 2
            temperature = min(40, max(15, temperature))  

            env_grid[i][j] = {
                "soil_moisture": round(soil, 4),
                "humidity": round(humidity, 4),
                "temperature": round(temperature, 4)
            }

    return env_grid