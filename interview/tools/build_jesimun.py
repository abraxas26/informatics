# -*- coding: utf-8 -*-
"""parse_jesimun.py 결과를 뷰어용 data/jesimun.js 로 내보낸다."""
import json, os, sys, glob

SETS, OUTDIR = sys.argv[1], sys.argv[2]
sets = json.load(open(SETS, encoding="utf-8"))

imgdir = os.path.join(OUTDIR, "jesimun")
ext = "webp"
if glob.glob(os.path.join(imgdir, "*.jpg")) and not glob.glob(os.path.join(imgdir, "*.webp")):
    ext = "jpg"
have = {os.path.splitext(os.path.basename(f))[0] for f in glob.glob(os.path.join(imgdir, "*." + ext))}

for s in sets:
    for b in s["blocks"]:
        b["pages"] = [p for p in b["pages"] if ("p%03d" % p) in have]

payload = {
    "ext": ext,
    "source": "부산광역시교육청학력개발원 「2026학년도 대입 수시모집 대비 면접자료집」",
    "note": "수식·도표·그림은 텍스트로 추출되지 않습니다. 각 블록의 ‘원본 페이지’를 함께 확인하세요.",
    "sets": sets,
}
out = os.path.join(OUTDIR, "jesimun.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("window.IV=window.IV||{};IV.jesimun=" +
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("sets:", len(sets), "bytes:", os.path.getsize(out))
