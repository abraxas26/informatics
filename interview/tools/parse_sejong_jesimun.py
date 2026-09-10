# -*- coding: utf-8 -*-
"""세종특별자치시교육청 「2026학년도 제시문 기반 면접 기출문제 분석 자료집」
   -> 제시문 뷰어용 문제 세트 JSON (부산 자료집과 같은 형식)

수식·도표가 많아 텍스트만으로는 읽을 수 없으므로 원본 쪽 번호를 함께 남긴다.
"""
import fitz, json, re, sys

SRC = (r"C:\Users\황윤정\Documents\CoolMessenger Files\Received Files"
       r"\세종특별자치시교육청진로교육원 진학지원부_[붙임1] 2026학년도 제시문 기반 면접 기출문제 분석 자료집.pdf")
OUT = sys.argv[1]
IMG_PREFIX = "s"          # 이미지 파일명 접두어 (부산 자료집은 p)

CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
FOOT = ("대입지원단", "학력관리팀", "면접지원팀")
COVER_UNIV = re.compile(r"^20\d\d학년도\s*(.+?(?:대학교|대학|과학기술원))\s*$")
RUN_HEAD = re.compile(r"^20\d\d학년도\s*(.+?(?:대학교|대학|과학기술원))\s*(?:\((.+?)\))?\s*(.*)$")


def clean(t):
    return re.sub(r"[ \t]{2,}", " ", CTRL.sub("", t)).rstrip()


class Set:
    def __init__(self, univ, jeonhyeong, track):
        self.univ, self.jeonhyeong, self.track = univ, jeonhyeong, track
        self.blocks = {}

    def add(self, label, line, page):
        b = self.blocks.setdefault(label, {"lines": [], "pages": set()})
        if line:
            b["lines"].append(line)
        b["pages"].add(page)

    def out(self):
        order = ["문제", "문항 분석 및 해설"]
        bl = []
        for label in order + [k for k in self.blocks if k not in order]:
            b = self.blocks.get(label)
            if not b:
                continue
            text = re.sub(r"\n{3,}", "\n\n", "\n".join(b["lines"])).strip()
            bl.append({"label": label, "text": text, "pages": sorted(b["pages"])})
        return {"univ": self.univ, "mode": "제시문 기반 면접",
                "jeonhyeong": self.jeonhyeong, "track": self.track,
                "title": self.track or "제시문 기반 면접", "blocks": bl,
                "img": IMG_PREFIX}


def page_rows(page):
    rows = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            t = CTRL.sub("", "".join(s["text"] for s in l["spans"]))
            if t.strip():
                rows.append((round(l["bbox"][1], 1), round(l["bbox"][0], 1),
                             l["spans"][0]["size"], t))
    rows.sort()
    return rows


def main():
    doc = fitz.open(SRC)
    sets, cur = [], None
    seen_analysis = False

    def flush():
        nonlocal cur
        if cur is not None and cur.blocks:
            sets.append(cur.out())
        cur = None

    for pno in range(doc.page_count):
        rows = page_rows(doc[pno])
        big = [(y, sz, t.strip()) for y, x0, sz, t in rows if sz >= 30 and y < 320]
        head = [t.strip() for y, x0, sz, t in rows if 20 <= sz < 30 and y < 200]

        # ── 표지: 새 세트 시작
        cover = next((t for y, sz, t in big if COVER_UNIV.match(t)), None)
        if cover:
            flush()
            univ = COVER_UNIV.match(cover).group(1)
            # 표지 구성: 32pt 대학명 / 32pt 전형 / 89pt 계열 / 47pt '문항 분석 및 해설'
            track = next((t.strip() for y, x0, sz, t in rows if sz >= 60), "")
            jeonhyeong = next((t for y, sz, t in big if t != cover and "분석" not in t), "")
            jeonhyeong = re.sub(r"\s*면접\s*문항\s*$", "", jeonhyeong)
            cur = Set(univ, clean(jeonhyeong), clean(track))
            seen_analysis = False
            continue

        if cur is None:
            continue

        # ── 본문: 분석 머리말이 한 번 나오면 그 뒤는 모두 해설 구간
        if any("분석" in h for h in head):
            seen_analysis = True
        label = "문항 분석 및 해설" if seen_analysis else "문제"
        got = False
        for y, x0, sz, raw in rows:
            s = raw.strip()
            if any(k in s for k in FOOT) or re.fullmatch(r"-?\s*\d+\s*-?", s):
                continue
            if sz >= 20 and y < 200:          # 머리말 자체는 본문이 아님
                continue
            cur.add(label, clean(raw), pno + 1)
            got = True
        if not got:
            cur.add(label, "", pno + 1)       # 그림만 있는 쪽도 이미지로는 보여준다
    flush()

    sets = [s for s in sets if any(b["pages"] for b in s["blocks"])]
    json.dump(sets, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from collections import Counter
    pages = {p for s in sets for b in s["blocks"] for p in b["pages"]}
    print("sets:", len(sets), "univs:", len({s["univ"] for s in sets}), "pages:", len(pages))
    print(Counter((s["univ"], s["track"]) for s in sets).most_common(12))


main()
