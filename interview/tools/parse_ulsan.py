# -*- coding: utf-8 -*-
"""울산광역시교육청 2025 대입 면접후기 자료집 -> 구조화 JSON"""
import fitz, json, re, sys

SRC = r"C:\Users\황윤정\Downloads\2025 대입 면접후기 자료집.pdf"
OUT = sys.argv[1]

LABELS = {"전형명", "지원학과", "면접방법", "질문", "및", "답변", "기타", "유의사항"}
CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")

def clean(t):
    return re.sub(r"[ \t]{2,}", " ", CTRL.sub("", t)).strip()

def garbled(t):
    toks = t.split()
    if len(toks) < 4:
        return len(t.strip()) > 0 and not re.search(r"[가-힣0-9A-Za-z]", t)
    odd = sum(1 for x in toks if len(x) == 1 and not x.isalnum())
    return odd / len(toks) > 0.45

def join_lines(raws):
    out = ""
    for i, r in enumerate(raws):
        s = r.strip()
        if not s:
            continue
        if not out:
            out = s
        else:
            out += (" " if raws[i - 1].endswith(" ") else "") + s
    return clean(out)

def strip_garbled(text, strict=True):
    """문장 끝에 섞여 들어온 깨진 글리프 제거"""
    if not text:
        return ""
    if garbled(text):
        return ""
    if re.fullmatch(r"[A-Za-z0-9 ,.'\"?!()\-]+", text):
        return text.strip()          # 영문으로만 된 정상 문항
    han = len(re.findall(r"[가-힣]", text))
    if len(text) >= 10 and han / len(text) < (0.25 if strict else 0.12):
        return ""
    # 뒤쪽에 붙은 깨진 조각 잘라내기
    m = re.search(r"((?:\s+[^\s가-힣]{1,2}){6,})\s*$", text)
    if m:
        text = text[:m.start()].strip()
    return text.strip()

class Rec:
    def __init__(self, univ):
        self.univ = univ
        self.jeonhyeong = ""
        self.dept = ""
        self.method = []
        self.notes = []
        self.qa = []
        self.qbuf = []
        self.abuf = []
    def flush_qa(self):
        if self.qbuf:
            q = strip_garbled(join_lines(self.qbuf))
            a = strip_garbled(join_lines(self.abuf), strict=False)
            if q:
                self.qa.append({"q": q, "a": a})
        self.qbuf, self.abuf = [], []
    def out(self):
        self.flush_qa()
        return {
            "univ": self.univ,
            "jeonhyeong": clean(self.jeonhyeong),
            "dept": clean(self.dept),
            "method": strip_garbled(join_lines(self.method)),
            "notes": strip_garbled(join_lines(self.notes)),
            "qa": self.qa,
        }

def main():
    doc = fitz.open(SRC)
    records, univ, rec = [], "", None

    def flush():
        nonlocal rec
        if rec is not None:
            o = rec.out()
            if o["qa"] or o["dept"]:
                records.append(o)
        rec = None

    for pno in range(7, doc.page_count):
        page = doc[pno]
        rows = []
        for b in page.get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for l in b["lines"]:
                txt = CTRL.sub("", "".join(s["text"] for s in l["spans"]))
                if not txt.strip():
                    continue
                sp = l["spans"][0]
                rows.append({"y": l["bbox"][1], "x0": l["bbox"][0],
                             "size": sp["size"], "font": sp["font"], "t": txt})
        rows.sort(key=lambda r: (r["y"], r["x0"]))

        labels = {}   # label -> [y, ...]
        for r in rows:
            lab = re.sub(r"\s+", "", r["t"].strip())
            if r["font"].startswith("GmarketSans") and r["x0"] < 120 \
               and r["size"] < 11 and lab in LABELS:
                labels.setdefault(lab, []).append(r["y"])
                r["label"] = lab

        def near(lab, y, tol):
            return any(abs(ly - y) <= tol for ly in labels.get(lab, []))

        prev_q_y = None
        for r in rows:
            t, y, x0 = r["t"], r["y"], r["x0"]
            gm = r["font"].startswith("GmarketSans")
            if gm and r["size"] >= 16:               # 대학 섹션 제목
                flush()
                univ = t.strip()
                continue
            if y < 90 or y > 770:                    # 머리말/꼬리말
                continue
            if "label" in r:
                continue
            if rec is None and not univ:
                continue
            # 전형명 / 지원학과 값
            if gm and r["size"] >= 11:
                if near("전형명", y, 8):
                    flush()
                    rec = Rec(univ)
                    rec.jeonhyeong = t
                    prev_q_y = None
                elif rec is not None and near("지원학과", y, 8):
                    rec.dept = t
                elif rec is not None and not rec.dept:
                    rec.dept = t
                continue
            if rec is None:
                continue
            # 질문
            if gm and x0 >= 138:
                if prev_q_y is None or (y - prev_q_y) > 18 or rec.abuf:
                    rec.flush_qa()
                rec.qbuf.append(t)
                prev_q_y = y
                continue
            # 답변 칼럼(깊은 들여쓰기)
            if x0 >= 143 and rec.qbuf:
                rec.abuf.append(t)
                continue
            # 기타/유의사항 셀
            if near("기타", y, 30) or near("유의사항", y, 30):
                rec.flush_qa()
                prev_q_y = None
                rec.notes.append(t)
                continue
            # 면접방법 셀
            if near("면접방법", y, 30) and not rec.qbuf:
                rec.method.append(t)
                continue
            # 답변
            if rec.qbuf:
                rec.abuf.append(t)
            elif not rec.qa:
                rec.method.append(t)
            else:
                rec.notes.append(t)
        # 페이지 경계: 질문 줄바꿈 판정 초기화
        prev_q_y = None
    flush()
    json.dump(records, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("records:", len(records),
          "univs:", len({r["univ"] for r in records}),
          "qa:", sum(len(r["qa"]) for r in records),
          "no-dept:", sum(1 for r in records if not r["dept"]),
          "no-jh:", sum(1 for r in records if not r["jeonhyeong"]))

main()
