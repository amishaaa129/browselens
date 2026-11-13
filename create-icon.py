
from PIL import Image, ImageDraw

img = Image.new("RGBA", (128, 128), (23, 37, 84, 255))
draw = ImageDraw.Draw(img)

# Draw a simple white lens
draw.ellipse((28, 28, 88, 88), outline="white", width=9)
draw.line((77, 77, 108, 108), fill="white", width=10)

img.save("extension/icons/icon128.png")

print("Notification icon created!")
