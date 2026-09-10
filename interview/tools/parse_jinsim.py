# -*- coding: utf-8 -*-
"""경기 진심 자료집 - 2025 선행학습영향평가 결과보고서 면접예시문항 -> JSON"""
import fitz, json, re, sys

SRC = r"C:\Users\황윤정\Downloads\2026 면접을 준비하다 - 경기도 진학 연구팀(진심).pdf"
OUT = sys.argv[1]
CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
SKIP_LINE = ("진학에 진심", "경기도 진학 연구팀", "선행학습 영향평가 결과보고서")


def clean(t):
    return re.sub(r"\s{2,}", " ", CTRL.sub("", t)).strip()


def merge_labels(raw):
    """세로로 이어진 라벨 줄을 하나로 합치기"""
    out = []
    for y, t in raw:
        if out and y - out[-1][2] < 17:
            out[-1] = (out[-1][0], out[-1][1] + " " + t, y)
        else:
            out.append((y, t, y))
    return [((a + c) / 2, b) for a, b, c in out]


def smart_join(parts):
    out = ""
    for i, x in enumerate(parts):
        t = x.strip()
        if not t:
            continue
        out = t if not out else out + ("" if not parts[i - 1].endswith(" ") else " ") + t
    return out


def pick(labels, y, carry):
    """세로 중앙정렬 라벨 중 해당 y가 속한 셀의 라벨 고르기"""
    if not labels:
        return carry
    if y < labels[0][0]:
        return carry if (carry and labels[0][0] > 250) else labels[0][1]
    chosen = labels[0][1]
    for i, (ly, lt) in enumerate(labels):
        nxt = labels[i + 1][0] if i + 1 < len(labels) else 1e9
        if y < (ly + nxt) / 2:
            return lt
        chosen = lt
    return chosen


def main():
    doc = fitz.open(SRC)
    items = []
    univ = cat = ""
    # 문항은 페이지를 넘어가며 이어질 수 있으므로 버퍼를 페이지 밖에서 유지한다
    buf, buf_univ, buf_cat = [], "", ""

    def flush():
        nonlocal buf
        if buf:
            s = clean(smart_join(buf))
            if len(s) > 12:
                items.append({"univ": buf_univ, "category": buf_cat, "q": s})
        buf = []

    for pno in range(25, 60):
        page = doc[pno]
        rows = []
        for b in page.get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for l in b["lines"]:
                t = CTRL.sub("", "".join(s["text"] for s in l["spans"]))
                if not t.strip():
                    continue
                rows.append((round(l["bbox"][1], 1), round(l["bbox"][0], 1),
                             l["spans"][0]["size"], t))
        rows.sort()
        # 본문 칼럼이 아예 없는 페이지(표 밖)는 건너뛴다
        if not any(x0 >= 255 and 62 < y < 772 for y, x0, sz, t in rows):
            continue

        ul = merge_labels([(y, t.strip()) for y, x0, sz, t in rows
                           if 55 <= x0 < 175 and 62 < y < 772 and sz < 12 and t.strip() != "대학"])
        cl = merge_labels([(y, t.strip()) for y, x0, sz, t in rows
                           if 175 <= x0 < 255 and 62 < y < 772 and sz < 12 and t.strip() != "평가영역"])

        for y, x0, sz, t in rows:
            s = t.strip()
            if x0 < 255 or y < 62 or y > 772:
                continue
            if any(k in s for k in SKIP_LINE):
                continue
            if s.startswith(("-", "‐", "–")):
                flush()
                buf_univ = pick(ul, y, univ)
                buf_cat = pick(cl, y, cat)
                buf = [t.lstrip().lstrip("-‐– ")]
            elif buf:
                buf.append(t.lstrip())
        if ul:
            univ = ul[-1][1]
        if cl:
            cat = cl[-1][1]
    flush()

    # 대학명 / 전형명 분리
    UNIV = re.compile(r"[가-힣A-Za-z()·\s]*?(?:대학교|교육대학교|과학기술원|사관학교|대학원대학교|대\(케이씨대\))")
    for it in items:
        raw = clean(it["univ"])
        m = UNIV.match(raw)
        if m:
            it["univ"] = clean(m.group(0))
            it["jeonhyeong"] = clean(raw[m.end():])
        else:
            it["univ"] = raw
            it["jeonhyeong"] = ""
        it["category"] = clean(re.sub(r"\s*\(.*", "", it["category"]))

    json.dump(items, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from collections import Counter
    print("items:", len(items), "univs:", len({i["univ"] for i in items}))
    print(Counter(i["category"] for i in items).most_common(12))


main()
