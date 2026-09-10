# -*- coding: utf-8 -*-
"""부산광역시교육청 「2026 대입 수시모집 대비 면접자료집」
   제시문 기반 면접 · MMI 면접 -> 문제 세트 JSON

수식·도표·그림은 텍스트로 추출되지 않으므로 블록마다 원본 PDF 쪽 번호를 함께 남긴다.
render_jesimun.py 가 그 쪽들을 이미지로 구워 뷰어에서 원본을 볼 수 있게 한다.
"""
import fitz, json, re, sys
from collections import Counter

SRC = r"C:\Users\황윤정\Downloads\2026 대입 수시모집 대비 면접자료집(최종)부산교육청.pdf"
OUT = sys.argv[1]

CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
HDR = re.compile(r"^(제시문 기반 면접|MMI 면접|서류 기반 면접)\(\s*"
                 r"(?:의예과\s*-\s*|서울 지역 대학\s*-\s*|부산 지역 대학\s*-\s*)?(.+)\)\s*$")
FOOT = ("부산진로진학지원센터", "부산광역시교육청학력개발원", "2026 대입 수시모집 대비 면접자료집")
BLOCK = re.compile(r"^\s*(\d+)\s*-\s*(\d+)\s{1,4}(문\s*제[^\n]{0,4}|출제\s*의도|문항\s*해설|"
                   r"채점\s*기준|예시\s*답안[^\n]*|출제\s*근거|자료\s*출처[^\n]*)\s*$")
ROMAN = re.compile(r"^([ⅠⅡⅢⅣⅤⅥⅦ])\s*([가-힣A-Za-z()·\s]{2,24})\s*$")
TRACK = re.compile(r"^\s*\d+\.\s*([가-힣A-Za-z()·,\s]{2,40})\s*$")
UNIV_NO = re.compile(r"^\s*\d{1,2}\s+(.+(?:대학교|대학|KAIST|KENTECH))\s*$")
LABEL_KEY = {"문제": "문제", "문제지": "문제", "출제의도": "출제 의도", "문항해설": "문항 해설",
             "채점기준": "채점 기준", "출제근거": "출제 근거"}
ORDER = ["면접 개요", "문제", "출제 의도", "문항 해설", "채점 기준", "예시 답안",
         "출제 근거", "자료 출처"]


def clean(t):
    return re.sub(r"[ \t]{2,}", " ", CTRL.sub("", t)).rstrip()


def norm_label(t):
    k = re.sub(r"\s+", "", t)
    if k.startswith("예시답안"):
        return "예시 답안"
    if k.startswith("자료출처"):
        return "자료 출처"
    return LABEL_KEY.get(k, k)


class Set:
    def __init__(self, univ, mode, jeonhyeong, track, title):
        self.univ, self.mode = univ, mode
        self.jeonhyeong, self.track, self.title = jeonhyeong, track, title
        self.blocks, self.cur = {}, None

    def start(self, label):
        self.blocks.setdefault(label, {"lines": [], "pages": set()})
        self.cur = label

    def add(self, line, page):
        if self.cur is None:
            self.start("문제")
        b = self.blocks[self.cur]
        b["lines"].append(line)
        b["pages"].add(page)

    def out(self):
        bl = []
        for label in ORDER + [k for k in self.blocks if k not in ORDER]:
            b = self.blocks.get(label)
            if not b:
                continue
            text = re.sub(r"\n{3,}", "\n\n", "\n".join(b["lines"])).strip()
            if not text and not b["pages"]:
                continue
            bl.append({"label": label, "text": text, "pages": sorted(b["pages"])})
        return {"univ": self.univ, "mode": self.mode, "jeonhyeong": self.jeonhyeong,
                "track": self.track, "title": self.title, "blocks": bl}


def page_lines(page):
    """같은 줄에 놓인 조각들을 하나의 시각적 행으로 합쳐 돌려준다 (예: "1-1" + "문 제")"""
    rows = []
    for b in page.get_text("dict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            t = CTRL.sub("", "".join(s["text"] for s in l["spans"]))
            if t.strip():
                rows.append((round(l["bbox"][1], 1), round(l["bbox"][0], 1), t))
    rows.sort()
    out, buf, by = [], [], None
    for y, x0, t in rows:
        if by is not None and y - by > 3.2:
            out.append((by, buf[0][0], "  ".join(x[1] for x in buf)))
            buf = []
        if not buf:
            by = y
        buf.append((x0, t))
    if buf:
        out.append((by, buf[0][0], "  ".join(x[1] for x in buf)))
    return out


def main():
    doc = fitz.open(SRC)
    sets, cur = [], None
    univ = mode = jeonhyeong = track = ""
    cur_key = None

    def close():
        nonlocal cur, cur_key
        if cur is not None:
            o = cur.out()
            if any(b["text"] or b["pages"] for b in o["blocks"]):
                sets.append(o)
        cur, cur_key = None, None

    for pno in range(doc.page_count):
        rows = page_lines(doc[pno])

        for y, x0, t in rows:
            if y < 62 and HDR.match(t.strip()):
                m = HDR.match(t.strip())
                if m.group(2).strip() != univ or m.group(1) != mode:
                    close()
                    jeonhyeong = track = ""
                mode, univ = m.group(1), m.group(2).strip()
                break

        if mode == "서류 기반 면접":      # 이 장은 별도 파서가 담당한다
            continue

        for y, x0, raw in rows:
            s = raw.strip()
            if y < 62 or y > 790 or any(k in s for k in FOOT):
                continue
            if UNIV_NO.match(s):          # "01 고려대학교" 같은 절 표지
                continue

            # ── 제시문 기반: "1-1  문 제" 형태의 블록 표지
            mb = BLOCK.match(raw)
            if mb:
                label, no = norm_label(mb.group(3)), mb.group(1)
                key = ("set", univ, no)
                if cur is None or key != cur_key:
                    close()
                    cur = Set(univ, mode, jeonhyeong, track, "문제 " + no)
                    cur_key = key
                cur.start(label)
                continue

            mr = ROMAN.match(s)
            if mr:
                name = re.sub(r"\s+", " ", mr.group(2)).strip()
                if name.startswith("면접 개요"):
                    close()
                    cur = Set(univ, mode, jeonhyeong, track, "면접 개요")
                    cur_key = ("overview", univ)
                    cur.start("면접 개요")
                elif mode == "MMI 면접":
                    close()
                    cur = Set(univ, mode, jeonhyeong, track, name)
                    cur_key = ("mmi", univ, name)
                    cur.start("문제")
                elif name.startswith("면접 질문 예시"):
                    close()
                elif name not in ("면접", "문제"):
                    jeonhyeong = name
                continue

            mt = TRACK.match(s)
            if mt and len(s) < 46 and re.search(r"계열|전공|과정|전형", s):
                name = re.sub(r"\s+", " ", mt.group(1)).strip()
                if "전형" in name:
                    jeonhyeong = name
                    if mode == "MMI 면접":       # MMI 는 전형 단위로 묶는다
                        close()
                        cur = Set(univ, mode, jeonhyeong, track, "면접 문항")
                        cur_key = ("mmi", univ, name)
                        cur.start("문제")
                else:
                    track = name
                continue

            if cur is not None:
                cur.add(clean(raw), pno + 1)
    close()

    sets = [s for s in sets if s["blocks"]]
    for i, s in enumerate(sets, 1):
        s["id"] = "j%03d" % i
    json.dump(sets, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    pages = {p for s in sets for b in s["blocks"] for p in b["pages"]}
    print("sets:", len(sets), "univs:", len({s["univ"] for s in sets}), "pages:", len(pages))
    print(Counter((s["mode"], s["univ"]) for s in sets).most_common())


main()
