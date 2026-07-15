from PIL import Image, ImageDraw

def create_chick_icon(size):
    # Create RGBA image with transparent background
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Scale variables based on size
    scale = size / 32.0
    
    # Rounded rect parameters
    r_width = int(32 * scale)
    r_radius = int(8 * scale)
    draw.rounded_rectangle([0, 0, r_width - 1, r_width - 1], radius=r_radius, fill=(0, 0, 0, 255))
    
    # Yellow circle parameters (Outline)
    cx = 14 * scale
    cy = 16 * scale
    cr = 7 * scale
    c_box = [cx - cr, cy - cr, cx + cr, cy + cr]
    draw.ellipse(c_box, outline=(255, 204, 0, 255), width=max(1, int(2.5 * scale)))
    
    # Yellow dot (Eye)
    er = 2.0 * scale
    e_box = [cx - er, cy - er, cx + er, cy + er]
    draw.ellipse(e_box, fill=(255, 204, 0, 255))
    
    # Yellow beak (Chevron path)
    # Drawing lines with anti-aliasing
    p1 = (19.5 * scale, 12 * scale)
    p2 = (24 * scale, 16 * scale)
    p3 = (19.5 * scale, 20 * scale)
    w = max(1, int(2.5 * scale))
    draw.line([p1, p2], fill=(255, 204, 0, 255), width=w, joint="round")
    draw.line([p2, p3], fill=(255, 204, 0, 255), width=w, joint="round")
    
    return img

try:
    # 1. Save standard PNG favicon (32x32 and 192x192)
    fav_32 = create_chick_icon(32)
    fav_32.save("public/favicon.png", "PNG")
    
    fav_192 = create_chick_icon(192)
    fav_192.save("public/favicon-192.png", "PNG")
    
    # 2. Save standard ICO favicon (containing multiple sizes: 16x16, 32x32, 48x48)
    ico_sizes = [16, 32, 48]
    ico_imgs = [create_chick_icon(s) for s in ico_sizes]
    ico_imgs[0].save("public/favicon.ico", format="ICO", sizes=[(s, s) for s in ico_sizes], append_images=ico_imgs[1:])
    
    print("Success: ICO and PNG favicons created successfully!")
except Exception as e:
    print(f"Error: {e}")
