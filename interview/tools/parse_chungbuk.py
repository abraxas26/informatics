# -*- coding: utf-8 -*-
"""충청북도교육청 면접 후기집 · 사례집 -> 후기 JSON

여러 해의 자료집이 같은 표 구조를 쓰되 문답 표시만 다르다.
  · 2024~2025 : [질문] / [답변]
  · 2022      : 1. 질문 / - 답변
사용법: py tools/parse_chungbuk.py <원본.pdf> <출력.json> <연도표기> <출처>
"""
import fitz, json, re, sys

SRC, OUT, YEAR, SOURCE = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
LABELS = {
    "대학명": "univ", "학과명": "dept", "전형유형": "type", "전형명": "jeonhyeong",
    "면접절차및과정": "method", "(진행방식)": "method", "기타유의사항": "notes",
    "최종합불현황": "result", "충원합인경우": "resultNote", "최초예비번호": "resultNote",
}
DIVIDER = "질문및답변내용"
Q_TAG = re.compile(r"^\[\s*질\s*문\s*\d*\s*\]\s*")
A_TAG = re.compile(r"^\[\s*답\s*변\s*\d*\s*\]\s*")
Q_NUM = re.compile(r"^(\d{1,2})\s*[.)]\s+")
A_DASH = re.compile(r"^[-‐–—]\s+")
Q_LETTER = re.compile(r"^Q\s*\d*\s*[.:)]\s*")
A_LETTER = re.compile(r"^A\s*\d*\s*[.:)]\s*")
FOOT = ("면접 사례집", "면접 후기집", "대학면접 후기집", "진로전담", "교사협의회",
        "충청북도교육청", "충북교육청")
# 질문이 끝났다고 볼 수 있는 어미 — 번호형 문답에서 답변 시작점을 잡는 데 쓴다
Q_END = re.compile(r"([?？]|요[.?]?|오[.?]?|까[?]?|나요[?]?|가요[?]?|세요[.]?|시오[.]?|"
                   r"이유[?]?|말[?]?|무엇인가[?]?|십시오[.]?)\s*$")


def clean(t):
    return re.sub(r"[ \t]{2,}", " ", CTRL.sub("", t)).strip()


def key(t):
    return re.sub(r"\s+", "", t)


def join(parts):
    out = ""
    for i, x in enumerate(parts):
        t = x.strip()
        if not t:
            continue
        out = t if not out else out + ("" if not parts[i - 1].endswith(" ") else " ") + t
    return clean(out)


class Rec:
    def __init__(self):
        self.f = {v: [] for v in set(LABELS.values())}
        self.qa, self.qbuf, self.abuf = [], [], []
        self.mode = "head"
        self.cur = None          # 여러 줄에 걸친 값을 이어 붙일 곳
        self.awaiting = None     # 지금 모으는 것이 질문인지 답변인지
        self.style = None        # 'tag' = [질문]/[답변]·Q:/A:,  'num' = 번호만 있는 형식

    def flush_qa(self):
        if self.qbuf:
            q, a = join(self.qbuf), join(self.abuf)
            if len(q) >= 6:
                self.qa.append({"q": q, "a": a})
        self.qbuf, self.abuf = [], []
        self.awaiting = None
        self.style = None

    def out(self):
        self.flush_qa()
        d = {k: join(v) for k, v in self.f.items()}
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
        rows = []
        for b in doc[pno].get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for l in b["lines"]:
                t = CTRL.sub("", "".join(s["text"] for s in l["spans"]))
                if t.strip():
                    rows.append({"y": round(l["bbox"][1], 1), "x0": round(l["bbox"][0], 1),
                                 "sz": l["spans"][0]["size"], "t": t})
        rows.sort(key=lambda r: (r["y"], r["x0"]))

        labels = [(r["y"], r["x0"], LABELS[key(r["t"])]) for r in rows
                  if key(r["t"]) in LABELS and r["sz"] >= 11.5]

        # 표 칸이 세로 중앙정렬이라 대학명 '값'이 '라벨'보다 위에 오기도 한다.
        # 그래서 라벨 위치보다 조금 앞에서 레코드를 끊는다.
        bounds = sorted(r["y"] - 16 for r in rows
                        if key(r["t"]) == "대학명" and r["sz"] >= 11.5)

        for r in rows:
            t, y, x0, sz = r["t"], r["y"], r["x0"], r["sz"]
            s = t.strip()
            if any(k in s for k in FOOT) or re.fullmatch(r"-?\s*\d{1,3}\s*-?", s):
                continue
            k = key(s)

            while bounds and y >= bounds[0]:      # 새 후기 시작
                bounds.pop(0)
                flush()
                rec = Rec()
            if rec is None:
                continue
            if k in LABELS and sz >= 11.5:
                continue                           # 라벨 줄
            if DIVIDER in k:
                rec.mode = "qa"
                continue
            if sz >= 16:                           # 큰 대학 제목(표지 글씨)
                continue

            if rec.mode == "qa":
                if Q_TAG.match(s) or Q_LETTER.match(s):
                    rec.flush_qa()
                    tag = Q_TAG if Q_TAG.match(s) else Q_LETTER
                    rec.qbuf.append(tag.sub("", t.lstrip()))
                    rec.style, rec.awaiting = "tag", "q"
                elif A_TAG.match(s) or A_LETTER.match(s):
                    if rec.qbuf:
                        tag = A_TAG if A_TAG.match(s) else A_LETTER
                        rec.abuf.append(tag.sub("", t.lstrip()))
                        rec.style, rec.awaiting = "tag", "a"
                elif Q_NUM.match(s) and x0 < 110:
                    rec.flush_qa()
                    q = Q_NUM.sub("", t.lstrip())
                    rec.qbuf.append(q)
                    rec.style = "num"
                    # 표시가 없는 번호형 자료는 어미로 질문의 끝을 판단한다
                    rec.awaiting = "a" if Q_END.search(q.strip()) else "q"
                elif A_DASH.match(s) and x0 < 110:
                    if rec.qbuf:
                        rec.abuf.append(A_DASH.sub("", t.lstrip()))
                        rec.awaiting = "a"
                elif rec.qbuf:
                    if rec.awaiting == "q":
                        rec.qbuf.append(t.lstrip())
                        # 번호형에서만 어미로 답변 시작을 추정한다
                        if rec.style == "num" and (Q_END.search(s)
                                                   or len(" ".join(rec.qbuf)) > 130):
                            rec.awaiting = "a"
                    else:
                        rec.abuf.append(t.lstrip())
                continue

            # 머리 표: 같은 칸(행)에서 왼쪽에 가장 가까운 라벨에 값을 붙인다.
            # 두 칸짜리 표라 오른쪽 값이 왼쪽 라벨에 붙지 않도록 거리 상한을 둔다.
            cands = [(x0 - lx, f) for ly, lx, f in labels
                     if abs(ly - y) <= 12 and 0 < x0 - lx <= 260]
            if cands:
                rec.cur = min(cands)[1]
                rec.f[rec.cur].append(t)
            elif rec.cur:
                rec.f[rec.cur].append(t)        # 이어지는 줄
    flush()

    for r in records:
        r["src"] = SOURCE
        r["year"] = YEAR
    json.dump(records, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("records:", len(records), "univs:", len({r["univ"] for r in records}),
          "qa:", sum(len(r["qa"]) for r in records),
          "no-dept:", sum(1 for r in records if not r["dept"]))


main()
