# -*- coding: utf-8 -*-
"""세종특별자치시교육청 「보인다! 5.0 면접지도 길라잡이」 2024학년도 대입 면접 후기 -> JSON"""
import fitz, json, re, sys

OUT = sys.argv[1]
# 같은 편집 형식의 다른 연도 자료집에도 쓸 수 있게 원본 경로를 인자로 받는다
SRC = sys.argv[2] if len(sys.argv) > 2 else r"C:\Users\황윤정\Downloads\2024 보인다 5.0 면접지도 길라잡이(세종시 교육청).pdf"

CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
QMARK = re.compile(r"^Q\s*\d*\s*[.:)]\s*")
AMARK = re.compile(r"^A\s*\d*\s*[.:)]\s*")
LABELS = {"대학명": "univ", "학과": "dept", "전형유형": "type", "전형명": "jeonhyeong",
          "면접시간": "time", "면접위원수": "panel", "면접절차": "process", "면접특징": "notes"}
DIVIDER = "질문및답변내용"


def clean(t):
    return re.sub(r"\s{2,}", " ", CTRL.sub("", t)).strip()


def key(t):
    return re.sub(r"\s+", "", t)


def smart_join(parts):
    out = ""
    for i, x in enumerate(parts):
        t = x.strip()
        if not t:
            continue
        out = t if not out else out + ("" if not parts[i - 1].endswith(" ") else " ") + t
    return clean(out)


class Rec:
    def __init__(self):
        self.f = {v: [] for v in LABELS.values()}
        self.qa, self.qbuf, self.abuf = [], [], []
        self.mode = "head"

    def flush_qa(self):
        if self.qbuf:
            q, a = smart_join(self.qbuf), smart_join(self.abuf)
            if q:
                self.qa.append({"q": q, "a": a})
        self.qbuf, self.abuf = [], []

    def out(self):
        self.flush_qa()
        d = {k: smart_join(v) for k, v in self.f.items()}
        d["notes"] = re.sub(r"\s*§\s*", " · ", d["notes"]).strip(" ·")
        d["qa"] = self.qa
        return d


def main():
    doc = fitz.open(SRC)
    records, rec = [], None

    def flush():
        nonlocal rec
        if rec is not None:
            o = rec.out()
            if o["univ"] and (o["qa"] or o["dept"]):
                records.append(o)
        rec = None

    for pno in range(doc.page_count):
        page = doc[pno]
        rows = []
        for b in page.get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for l in b["lines"]:
                t = CTRL.sub("", "".join(s["text"] for s in l["spans"]))
                if not t.strip():
                    continue
                rows.append({"y": round(l["bbox"][1], 1), "x0": round(l["bbox"][0], 1),
                             "size": l["spans"][0]["size"], "t": t})
        rows.sort(key=lambda r: (r["y"], r["x0"]))

        # 이 페이지의 헤더 라벨 위치
        labels = [(r["y"], r["x0"], LABELS[key(r["t"])]) for r in rows
                  if (r["x0"] < 160 or 320 <= r["x0"] < 420) and key(r["t"]) in LABELS]

        for r in rows:
            t, y, x0 = r["t"], r["y"], r["x0"]
            s = t.strip()
            if r["size"] >= 15 and "면접 후기" in s:
                flush()
                rec = Rec()
                continue
            if rec is None or y > 800:
                continue
            if key(s) in LABELS and (x0 < 160 or 320 <= x0 < 420):
                continue
            if key(s) in ("면접", "형식") and x0 < 100:
                continue
            if s.startswith("[") or key(s).startswith("[후배조언"):
                continue
            if DIVIDER in key(s):
                rec.mode = "qa"
                continue
            if re.fullmatch(r"-?\s*\d+\s*-?", s) or "면접지도 길라잡이" in s:
                continue

            if rec.mode == "qa":
                if QMARK.match(s):
                    rec.flush_qa()
                    rec.qbuf.append(QMARK.sub("", t.lstrip()))
                elif AMARK.match(s):
                    if rec.qbuf:
                        rec.abuf.append(AMARK.sub("", t.lstrip()))
                elif rec.qbuf:
                    (rec.abuf if rec.abuf else rec.qbuf).append(t.lstrip())
                continue

            # 헤더 표: 같은 행(y)에서 왼쪽에 있는 가장 가까운 라벨에 값을 붙인다
            cands = [(x0 - lx, f) for ly, lx, f in labels if abs(ly - y) <= 6 and lx < x0]
            if cands:
                rec.f[min(cands)[1]].append(t)
            elif x0 >= 150 and (rec.f["notes"] or s.startswith("§")):
                rec.f["notes"].append(t)
    flush()

    json.dump(records, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("records:", len(records), "univs:", len({r["univ"] for r in records}),
          "qa:", sum(len(r["qa"]) for r in records),
          "no-dept:", sum(1 for r in records if not r["dept"]))


main()
