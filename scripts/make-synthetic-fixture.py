"""Optional local QA fixture. This is synthetic, not a Pokemon GO screenshot."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

out = Path(__file__).resolve().parent.parent / 'test-output'
out.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/msgothic.ttc', 30)
im = Image.new('RGB', (360, 780), 'white')
draw = ImageDraw.Draw(im)
draw.text((100, 60), 'CP599', font=font, fill='#173b3d')
draw.text((95, 290), 'ヒノアラシ', font=font, fill='#173b3d')
for i, iv in enumerate([3, 3, 5]):
    y = 480 + i * 37
    draw.rectangle((35, y, 214, y + 7), fill=(226, 216, 210))
    draw.rectangle((35, y, 34 + iv * 12, y + 7), fill=(244, 151, 94))
im.save(out / 'synthetic-appraisal.png')
im.crop((0, 0, 360, round(780 * .57))).save(out / 'synthetic-ocr-crop.png')
print('Synthetic fixtures written to test-output (not real screen accuracy evidence).')
