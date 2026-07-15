from PIL import Image, ImageChops

def trim(im):
    bg = Image.new(im.mode, im.size, (255, 255, 255))
    diff = ImageChops.difference(im, bg)
    diff = ImageChops.add(diff, diff, 2.0, -100)
    bbox = diff.getbbox()
    if bbox:
        # Add a small padding of 10px around the bounding box
        padding = 10
        width, height = im.size
        left = max(0, bbox[0] - padding)
        top = max(0, bbox[1] - padding)
        right = min(width, bbox[2] + padding)
        bottom = min(height, bbox[3] + padding)
        return im.crop((left, top, right, bottom))
    return im

try:
    img = Image.open("public/logo.png").convert("RGB")
    cropped = trim(img)
    cropped.save("public/logo.png", "PNG")
    print("Success: Logo trimmed successfully!")
except Exception as e:
    print(f"Error: {e}")
