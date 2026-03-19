import cv2
import numpy as np
import os

def draw_heatmap(image_path, infected_points, output_path):

    img = cv2.imread(image_path)

    if img is None:
        raise ValueError("Invalid image path")

    h, w = img.shape[:2]

    heatmap = np.zeros((h, w), dtype=np.float32)

    y_coords, x_coords = np.meshgrid(np.arange(h), np.arange(w), indexing='ij')

    for point in infected_points:
        cx = float(point["x"])
        cy = float(point["y"])
        conf = float(point["conf"])

        spread = 70 + (conf * 80)

        dist_sq = (x_coords - cx) ** 2 + (y_coords - cy) ** 2

        influence = conf * np.exp(-dist_sq / (2 * spread ** 2))

        heatmap += np.clip(influence, 0, 1)

    min_val = np.min(heatmap)
    max_val = np.max(heatmap)

    if max_val > min_val:
        heatmap = (heatmap - min_val) / (max_val - min_val)

    heatmap = np.power(heatmap, 0.5)

    heatmap = (heatmap * 255).astype(np.uint8)

    heatmap_color = apply_custom_colormap(heatmap)

    overlay = cv2.addWeighted(img, 0.6, heatmap_color, 0.4, 0)

    for p in infected_points:
        x = int(float(p["x"]))
        y = int(float(p["y"]))
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