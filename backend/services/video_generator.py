import cv2
import numpy as np


def create_video(image_paths, output_path, fps=6, steps_between=5):
    frames = []

    images = [cv2.imread(p) for p in image_paths]

    for i in range(len(images) - 1):
        img1 = images[i].astype(np.float32)
        img2 = images[i + 1].astype(np.float32)

        # add original frame
        frames.append(img1.astype(np.uint8))

        # interpolate between frames
        for t in np.linspace(0, 1, steps_between):
            blended = cv2.addWeighted(img1, 1 - t, img2, t, 0)
            frames.append(blended.astype(np.uint8))

    frames.append(images[-1])

    height, width, _ = frames[0].shape

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    video = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    for frame in frames:
        video.write(frame)

    video.release()

    return output_path