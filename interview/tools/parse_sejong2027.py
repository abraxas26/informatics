# -*- coding: utf-8 -*-
"""세종특별자치시교육청 「2027학년도 대입 수시모집 면접 전형 자료집」
   -> 대학·전형별 면접 정보 + 평가영역별 예시문항 JSON
"""
import fitz, json, re, sys

SRC = (r"C:\Users\황윤정\Documents\CoolMessenger Files\Received Files"
       r"\세종특별자치시교육청진로교육원 진학지원부_[붙임2] 2027학년도 대입 수시모집 면접 전형 자료집 (1).pdf")
OUT = sys.argv[1]

CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
FOOT = ("대입지원단", "학력관리팀")
FIELDS = {"선발방법": "select", "면접전형": "type", "면접방법": "method",
          "면접일정": "schedule", "평가요소": "weights", "기타": "notes", "유의사항": "notes"}
COLHEAD = {"구분", "내용", "평가영역"}
QCOLHEAD = "면접예시문항"
UNIV = re.compile(r"^(.+?(?:대학교|대학|과학기술원|사관학교))$")
BULLET = "∙·•‧ㆍ-"


def clean(t):
    return re.sub(r"[ \t]{2,}", " ", CTRL.sub("", t)).strip()


def key(t):
    return re.sub(r"\s+", "", t)


class Jh:
    """하나의 전형"""
    def __init__(self, univ, name):
        self.univ, self.name = univ, name
        self.f = {v: [] for v in set(FIELDS.values())}
        self.areas = []          # [{"area":..., "questions":[...], "_y":마지막 줄 y}]
        self.cur = None
        self.qbuf = []
        self.mode = "head"

    def add_area(self, t, y, page):
        t = clean(t)
        if not t:
            return
        last = self.areas[-1] if self.areas else None
        # 영역명이 두 줄로 나뉘거나 (40%) 가 따로 떨어진 경우 이어 붙인다
        if last and last["_page"] == page and 0 <= y - last["_y"] <= 22:
            last["area"] = clean(last["area"] + " " + t)
            last["_y"] = y
        else:
            self.areas.append({"area": t, "questions": [], "_y": y, "_page": page})

    def flush_q(self):
        if self.qbuf and self.areas:
            q = clean(" ".join(x.strip() for x in self.qbuf))
            if len(q) >= 8:
                self.areas[-1]["questions"].append(q)
        self.qbuf = []

    def out(self):
        self.flush_q()
        d = {"univ": self.univ, "jeonhyeong": clean(self.name)}
        for k, v in self.f.items():
            d[k] = clean(" ".join(x.strip() for x in v))
        d["areas"] = [{"area": a["area"], "questions": a["questions"]}
                      for a in self.areas if a["questions"]]
        return d


def main():
    doc = fitz.open(SRC)
    items, cur = [], None
    univ, jh_lines = "", []

    def flush():
        nonlocal cur
        if cur is not None:
            o = cur.out()
            if o["jeonhyeong"] and (o["areas"] or o["method"] or o["select"]):
                items.append(o)
        cur = None

    for pno in range(doc.page_count):
        rows = []
        for b in doc[pno].get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for l in b["lines"]:
                t = CTRL.sub("", "".join(s["text"] for s in l["spans"]))
                if t.strip():
                    rows.append((round(l["bbox"][1], 1), round(l["bbox"][0], 1),
                                 l["spans"][0]["size"], t))
        rows.sort()

        # 표 왼쪽 라벨의 y 위치 (셀은 세로 중앙정렬이므로 라벨 사이 중점이 셀 경계)
        labels = [(y, FIELDS[key(t.strip())]) for y, x0, sz, t in rows
                  if x0 < 112 and key(t.strip()) in FIELDS]

        def field_at(y):
            if not labels:
                return None
            for i, (ly, f) in enumerate(labels):
                nxt = labels[i + 1][0] if i + 1 < len(labels) else 1e9
                if y < (ly + nxt) / 2:
                    return f
            return labels[-1][1]

        for y, x0, sz, raw in rows:
            s = raw.strip()
            if any(k in s for k in FOOT) or re.fullmatch(r"-?\s*\d+\s*-?", s):
                continue

            if sz >= 19:                                   # 대학 표지
                m = UNIV.match(s)
                if m:
                    flush()
                    univ, jh_lines = m.group(1).strip(), []
                continue
            if sz >= 12.5:                                 # 전형 제목 (여러 줄 가능)
                if s.startswith("■"):
                    flush()
                    jh_lines = [s.lstrip("■ ").strip()]
                    cur = Jh(univ, jh_lines[0])
                elif cur is not None and cur.mode == "head" and not cur.f["type"]:
                    jh_lines.append(s)
                    cur.name = " ".join(jh_lines)
                continue
            if cur is None:
                continue

            k = key(s)
            if k == QCOLHEAD:                              # 여기서부터 예시문항 구간
                cur.flush_q()
                cur.mode, cur.cur = "areas", None
                continue
            if k in COLHEAD:
                continue

            if cur.mode == "head":
                if x0 < 112:
                    if k in FIELDS:
                        cur.cur = FIELDS[k]
                    continue                               # 라벨 줄은 값이 아니다
                f = field_at(y) or cur.cur
                if f:
                    cur.cur = f
                    cur.f[f].append(raw.lstrip())
                continue

            # 예시문항 구간
            if x0 < 112:
                continue                                   # '평가 요소' 같은 표 라벨
            if x0 < 182:
                cur.flush_q()
                cur.add_area(s, y, pno)
            elif s.startswith(tuple(BULLET)):
                cur.flush_q()
                cur.qbuf.append(raw.lstrip().lstrip(BULLET + " "))
            elif cur.qbuf:
                cur.qbuf.append(raw.lstrip())
    flush()

    json.dump(items, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from collections import Counter
    print("전형:", len(items), "대학:", len({i["univ"] for i in items}),
          "문항:", sum(len(a["questions"]) for i in items for a in i["areas"]))
    print(Counter(i["univ"] for i in items).most_common(5))


main()
