import imageio.v2 as imageio


def create_gif(image_paths, output_path, duration=2.0):
    frames = []

    for path in image_paths:
        img = imageio.imread(path)
        frames.append(img)
        frames.append(img)

    imageio.mimsave(output_path, frames, duration=duration)

    return output_path
