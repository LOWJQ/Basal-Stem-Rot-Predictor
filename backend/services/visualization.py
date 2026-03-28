import cv2
import numpy as np
import os


def draw_heatmap(
    image_path, risk_map, current_points, env_grid, output_path, week=None
):

    img = cv2.imread(image_path)

    if img is None:
        raise ValueError("Invalid image path")

    height, width = img.shape[:2]

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
        cv2.circle(overlay, (x, y), 8, (255, 255, 255), -1)
        cv2.circle(overlay, (x, y), 6, (255, 0, 0), -1)

    if week is not None:
        cv2.putText(
            overlay,
            f"{week}" if week == "Now" else f"Week {week}",
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            (255, 255, 255),
            2,
        )

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    cv2.imwrite(output_path, overlay)

    return output_path


def apply_custom_colormap(heatmap):
    heatmap = heatmap.astype(np.float32) / 255.0

    r = np.zeros_like(heatmap)
    g = np.zeros_like(heatmap)
    b = np.zeros_like(heatmap)

    low_mask = heatmap < 0.4
    r[low_mask] = 0.08 + (heatmap[low_mask] / 0.4) * 0.22
    g[low_mask] = 0.72 + (heatmap[low_mask] / 0.4) * 0.24

    medium_mask = (heatmap >= 0.4) & (heatmap < 0.72)
    r[medium_mask] = 0.92 + ((heatmap[medium_mask] - 0.4) / 0.32) * 0.08
    g[medium_mask] = 0.58 - ((heatmap[medium_mask] - 0.4) / 0.32) * 0.18

    high_mask = heatmap >= 0.72
    r[high_mask] = 0.92 + ((heatmap[high_mask] - 0.72) / 0.28) * 0.08
    g[high_mask] = 0.16 - ((heatmap[high_mask] - 0.72) / 0.28) * 0.16
    g[high_mask] = np.clip(g[high_mask], 0.0, 0.16)

    color = np.stack([b, g, r], axis=-1)

    return (color * 255).astype(np.uint8)
