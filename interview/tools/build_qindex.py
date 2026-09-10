# -*- coding: utf-8 -*-
import json, os, glob, sys
DATA = sys.argv[1]
rows = []
for f in sorted(glob.glob(os.path.join(DATA, "univ", "*.json"))):
    slug = os.path.splitext(os.path.basename(f))[0]
    d = json.load(open(f, encoding="utf-8"))
    for ri, r in enumerate(d["reviews"]):
        for qa in r["qa"]:
            rows.append([slug, ri, r["dept"], qa["q"]])
    for o in d["official"]:
        rows.append([slug, -1, "", o["q"]])
json.dump(rows, open(os.path.join(DATA, "qindex.json"), "w", encoding="utf-8"),
          ensure_ascii=False, separators=(",", ":"))
print("qindex rows:", len(rows), "bytes:", os.path.getsize(os.path.join(DATA, "qindex.json")))
