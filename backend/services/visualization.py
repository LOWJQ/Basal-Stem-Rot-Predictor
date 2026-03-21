import cv2
import numpy as np
import os


def draw_heatmap(
    image_path, risk_map, current_points, env_grid, output_path
):

    img = cv2.imread(image_path)

    if img is None:
        raise ValueError("Invalid image path")

    height, width = img.shape[:2]

    env_map = np.array([[cell["soil_moisture"] for cell in row] for row in env_grid])

    env_map_resized = cv2.resize(
        env_map, (width, height), interpolation=cv2.INTER_LINEAR
    )

    env_min = np.min(env_map_resized)
    env_max = np.max(env_map_resized)

    if env_max > env_min:
        env_norm = (env_map_resized - env_min) / (env_max - env_min)
    else:
        env_norm = env_map_resized

    if risk_map.shape != (height, width):
        risk_map = cv2.resize(risk_map, (width, height), interpolation=cv2.INTER_LINEAR)

    combined = risk_map

    heatmap = np.clip(combined, 0, 1)

    heatmap = np.power(heatmap, 0.8)

    heatmap = (heatmap * 255).astype(np.uint8)

    heatmap_color = apply_custom_colormap(heatmap)

    overlay = cv2.addWeighted(img, 0.6, heatmap_color, 0.4, 0)

    for p in current_points:
        x, y = int(p["x"]), int(p["y"])
        cv2.circle(overlay, (x, y), 5, (255, 0, 0), -1)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cv2.imwrite(output_path, overlay)

    return output_path


def apply_custom_colormap(heatmap):
    heatmap = heatmap.astype(np.float32) / 255.0

    r = np.zeros_like(heatmap)
    g = np.zeros_like(heatmap)
    b = np.zeros_like(heatmap)

    mask1 = heatmap < 0.5
    r[mask1] = heatmap[mask1] / 0.5
    g[mask1] = 1.0

    mask2 = heatmap >= 0.5
    r[mask2] = 1.0
    g[mask2] = 1.0 - ((heatmap[mask2] - 0.5) / 0.5)

    color = np.stack([b, g, r], axis=-1)

    return (color * 255).astype(np.uint8)
