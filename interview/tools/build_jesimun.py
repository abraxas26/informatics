# -*- coding: utf-8 -*-
"""제시문 세트 파일들을 합쳐 뷰어용 data/jesimun.js 로 내보낸다.

사용법: py tools/build_jesimun.py data <sets1.json> [<sets2.json> ...]
각 세트의 "img" 값이 원본 쪽 이미지 파일의 접두어가 된다 (없으면 p).
"""
import json, os, sys, glob

OUTDIR = sys.argv[1]
SET_FILES = sys.argv[2:]

SOURCE_BY_PREFIX = {
    "p": "부산광역시교육청학력개발원 「2026학년도 대입 수시모집 대비 면접자료집」",
    "s": "세종특별자치시교육청 「2026학년도 제시문 기반 면접 기출문제 분석 자료집」",
}

imgdir = os.path.join(OUTDIR, "jesimun")
ext = "webp"
if glob.glob(os.path.join(imgdir, "*.jpg")) and not glob.glob(os.path.join(imgdir, "*.webp")):
    ext = "jpg"
have = {os.path.splitext(os.path.basename(f))[0]
        for f in glob.glob(os.path.join(imgdir, "*." + ext))}

sets = []
for f in SET_FILES:
    for s in json.load(open(f, encoding="utf-8")):
        s.setdefault("img", "p")
        s["src"] = SOURCE_BY_PREFIX.get(s["img"], "")
        for b in s["blocks"]:
            b["pages"] = [p for p in b["pages"]
                          if ("%s%03d" % (s["img"], p)) in have]
        if any(b["pages"] or b["text"] for b in s["blocks"]):
            sets.append(s)

for i, s in enumerate(sets, 1):
    s["id"] = "j%03d" % i

payload = {
    "ext": ext,
    "sources": sorted({s["src"] for s in sets if s.get("src")}),
    "note": "수식·도표·그림은 텍스트로 추출되지 않습니다. 원본 쪽 이미지를 그대로 싣습니다.",
    "sets": sets,
}
out = os.path.join(OUTDIR, "jesimun.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("window.IV=window.IV||{};IV.jesimun=" +
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n")

from collections import Counter
print("sets:", len(sets), "univs:", len({s["univ"] for s in sets}),
      "pages:", sum(len(b["pages"]) for s in sets for b in s["blocks"]),
      "bytes:", os.path.getsize(out))
print(Counter(s["univ"] for s in sets).most_common())
