# -*- coding: utf-8 -*-
"""경상남도교육청 2026 학생부 기반 면접 자료집 -> 구조화 JSON"""
import fitz, json, re, sys

SRC = r"C:\Users\황윤정\Downloads\2026 대입 대입을 위한 면접 전략 자료집 「학생부 기반 면접 자료집」_경남교육청.pdf"
OUT = sys.argv[1]

CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
COLS = [(0, 110, "univ"), (110, 215, "dept"), (215, 330, "jeonhyeong"), (330, 392, "naesin")]
RESULT_COLS = [(392, 432, "최초합격"), (432, 492, "충원합격"), (492, 999, "불합격")]
YES = set("Oo0○◯●ㅇVv✓〇")
NO = set("xX×")
HEADER_WORDS = {"지원대학", "지원학과(부)", "전형유형/세부전형명", "내신등급", "최초", "합격",
                "충원합격", "불합격", "(지원대학기준)", "최초합격", "질문", "및", "답변", "면접"}
SUBLABELS = ("면접유형", "면접절차", "유의사항")
FOOTER = re.compile(r"^(.+?)∙\d+$")

def clean(t):
    return re.sub(r"\s{2,}", " ", CTRL.sub("", t)).strip()

def col_of(x0, cols):
    for a, b, name in cols:
        if a <= x0 < b:
            return name
    return None

def join(parts):
    out = ""
    for i, p in enumerate(parts):
        s = p.strip()
        if not s:
            continue
        out = s if not out else out + ("" if not parts[i - 1].endswith(" ") else " ") + s
    return clean(out)

class Rec:
    def __init__(self, univ):
        self.section_univ = univ
        self.head = []
        self.qa = []
        self.qbuf, self.abuf = [], []
    def push_q(self, t):
        self.flush(); self.qbuf.append(t)
    def flush(self):
        if self.qbuf:
            q, a = join(self.qbuf), join(self.abuf)
            if q:
                self.qa.append({"q": q, "a": a})
        self.qbuf, self.abuf = [], []

def group_rows(rows):
    groups, cur, cy = [], [], None
    for y, x0, t in sorted(rows):
        if cy is not None and abs(y - cy) > 4:
            groups.append(sorted(cur)); cur = []
            cy = y
        else:
            cy = y if cy is None else cy
        cur.append((x0, t))
    if cur:
        groups.append(sorted(cur))
    return groups

def parse_head(rows):
    d = {"univ_raw": "", "dept": "", "jeonhyeong": "", "naesin": "", "result": "",
         "result_note": "", "suneung": "", "type": "",
         "면접유형": "", "면접절차": "", "유의사항": ""}
    groups = group_rows(rows)
    gi = 0
    while gi < len(groups) and not any(t.strip() == "지원대학" for _, t in groups[gi]):
        gi += 1
    gi += 1
    while gi < len(groups) and not any(t.strip().startswith("수능") for _, t in groups[gi]):
        for x0, t in groups[gi]:
            s = t.strip()
            if not s or s in HEADER_WORDS:
                continue
            c = col_of(x0, COLS)
            if c:
                key = "univ_raw" if c == "univ" else c
                d[key] = (d[key] + " " + s).strip() if d[key] else s
                continue
            r = col_of(x0, RESULT_COLS)
            if r:
                if len(s) == 1 and s in YES:
                    d["result"] = r
                elif len(s) == 1 and s in NO:
                    pass
                else:
                    sep = " " if (d["result_note"] and (s[0].isdigit() or d["result_note"][-1].isdigit())) else ""
                    d["result_note"] = (d["result_note"] + sep + s).strip()
        gi += 1
    if gi < len(groups):
        opts, mark = [], None
        for x0, t in groups[gi]:
            s = t.strip()
            if s.startswith("수능"):
                continue
            if s in ("최저충족", "최저미충족", "최저기준없음"):
                opts.append((x0, s))
            elif len(s) == 1 and s in YES:
                mark = x0
        if opts:
            if mark is not None:
                pick = [o for o in opts if o[0] < mark]
                d["suneung"] = pick[-1][1] if pick else opts[0][1]
        gi += 1
    field = None
    for g in groups[gi:]:
        for x0, t in sorted(g):
            s = t.strip()
            if not s or s in HEADER_WORDS:
                continue
            if s == "전형유형":
                field = "type"; continue
            if s in SUBLABELS:
                field = s; continue
            if field:
                d[field] = clean((d[field] + " " + s) if d[field] else s)
    return d

def main():
    doc = fitz.open(SRC)
    records, rec, section = [], None, ""

    def flush():
        nonlocal rec
        if rec is None:
            return
        rec.flush()
        d = parse_head(rec.head)
        if rec.qa and (d["univ_raw"] or rec.section_univ):
            d["univ"] = rec.section_univ or d["univ_raw"]
            d["qa"] = rec.qa
            records.append(d)
        rec = None

    for pno in range(doc.page_count):
        page = doc[pno]
        rows = []
        for b in page.get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for l in b["lines"]:
                txt = CTRL.sub("", "".join(s["text"] for s in l["spans"]))
                if not txt.strip():
                    continue
                rows.append((round(l["bbox"][1], 1), round(l["bbox"][0], 1),
                             l["spans"][0]["size"], txt))
        rows.sort()
        for y, x0, size, txt in rows:
            s = txt.strip()
            m = FOOTER.match(s)
            if m and y > 760 and "면접 전략 자료집" not in s and "참고" not in s:
                section = m.group(1).strip()
                continue
            if size >= 15:
                flush()
                rec = Rec(section) if "면접후기" in re.sub(r"\s+", "", s) else None
                continue
            if rec is None or y > 760 or y < 50:
                continue
            if s in ("질문", "및", "답변") and x0 < 115:
                continue
            if s.startswith(("■", "▪", "◾")):
                rec.push_q(txt.lstrip().lstrip("■▪◾"))
            elif s.startswith("☞"):
                if rec.qbuf:
                    rec.abuf.append(txt.replace("☞", " ", 1))
            elif rec.qbuf:
                (rec.abuf if rec.abuf else rec.qbuf).append(txt)
            else:
                rec.head.append((y, x0, txt))
    flush()
    json.dump(records, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from collections import Counter
    print("records:", len(records), "univs:", len({r["univ"] for r in records}),
          "qa:", sum(len(r["qa"]) for r in records))
    print(Counter(r["result"] for r in records))
    print(Counter(r["suneung"] for r in records))

main()
