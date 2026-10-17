# Contact sheet: python3 scripts/sheet.py out.png cols scale img1 img2 ...  (labels each tile with its file name)
import sys
from PIL import Image, ImageDraw
out, cols, scale, files = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), sys.argv[4:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = int(ims[0].width * scale), int(ims[0].height * scale)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + 14)), (20, 20, 24))
d = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, files)):
    x, y = (i % cols) * w, (i // cols) * (h + 14)
    sheet.paste(im.resize((w, h), Image.NEAREST), (x, y + 14))
    d.text((x + 4, y + 1), f.rsplit('/', 1)[-1], fill=(230, 230, 200))
sheet.save(out)
print('wrote', out, sheet.size)
