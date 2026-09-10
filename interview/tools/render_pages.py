# -*- coding: utf-8 -*-
"""문제 세트가 참조하는 원본 PDF 쪽을 이미지로 굽는다 (제시문 뷰어용).

사용법: py tools/render_pages.py <sets.json> <출력폴더> <원본.pdf> <파일접두어>
  예)   py tools/render_pages.py sejong_jesi.json data/jesimun "...분석 자료집.pdf" s
"""
import fitz, json, os, sys, io as _io

try:
    from PIL import Image
except ImportError:
    Image = None

SETS, OUTDIR, SRC, PREFIX = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
DPI, QUALITY = 120, 74
EXT = "webp" if Image else "jpg"

sets = json.load(open(SETS, encoding="utf-8"))
pages = sorted({p for s in sets for b in s["blocks"] for p in b["pages"]})
os.makedirs(OUTDIR, exist_ok=True)

doc = fitz.open(SRC)
total = 0
for p in pages:
    path = os.path.join(OUTDIR, "%s%03d.%s" % (PREFIX, p, EXT))
    pix = doc[p - 1].get_pixmap(dpi=DPI)
    if Image:
        Image.open(_io.BytesIO(pix.tobytes("png"))).convert("RGB").save(
            path, "WEBP", quality=QUALITY, method=5)
    else:
        pix.save(path, jpg_quality=QUALITY)
    total += os.path.getsize(path)
print("pages:", len(pages), EXT, "total: %.1f MB" % (total / 1024 / 1024))
