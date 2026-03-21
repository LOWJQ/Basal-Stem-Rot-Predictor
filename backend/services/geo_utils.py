import math

#used to generate the coordinate for other area based on the altitude and center latitude and longitude
def generate_grid_coordinates(center_lat, center_lon, altitude, grid_size=6):
    FOV = 60 

    ground_width = 2 * altitude * math.tan(math.radians(FOV / 2))

    meters_per_deg_lat = 111320
    meters_per_deg_lon = 111320 * math.cos(math.radians(center_lat))

    lat_offset = ground_width / meters_per_deg_lat
    lon_offset = ground_width / meters_per_deg_lon

    coords = []

    for i in range(grid_size):
        row = []
        for j in range(grid_size):
            lat = center_lat + (i - grid_size//2) * (lat_offset / grid_size)
            lon = center_lon + (j - grid_size//2) * (lon_offset / grid_size)

            row.append((lat, lon))
        coords.append(row)

    return coords