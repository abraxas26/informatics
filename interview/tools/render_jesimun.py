# -*- coding: utf-8 -*-
"""제시문 세트가 참조하는 원본 PDF 쪽을 이미지로 굽는다.

수식·도표·그림은 텍스트 추출이 되지 않으므로, 뷰어에서 원본 쪽을 함께 보여 준다.
사용법: py tools/render_jesimun.py jesimun.json data/jesimun
"""
import fitz, json, os, sys, io as _io

try:
    from PIL import Image
except ImportError:
    Image = None

SRC = r"C:\Users\황윤정\Downloads\2026 대입 수시모집 대비 면접자료집(최종)부산교육청.pdf"
SETS, OUTDIR = sys.argv[1], sys.argv[2]
DPI, QUALITY = 120, 74
EXT = "webp" if Image else "jpg"

sets = json.load(open(SETS, encoding="utf-8"))
pages = sorted({p for s in sets for b in s["blocks"] for p in b["pages"]})
os.makedirs(OUTDIR, exist_ok=True)

doc = fitz.open(SRC)
total = 0
for p in pages:
    path = os.path.join(OUTDIR, "p%03d.%s" % (p, EXT))
    pix = doc[p - 1].get_pixmap(dpi=DPI)
    if Image:
        img = Image.open(_io.BytesIO(pix.tobytes("png"))).convert("RGB")
        img.save(path, "WEBP", quality=QUALITY, method=5)
    else:
        pix.save(path, jpg_quality=QUALITY)
    total += os.path.getsize(path)
print("pages:", len(pages), EXT, "total: %.1f MB" % (total / 1024 / 1024))
