# -*- coding: utf-8 -*-
"""「2026학년도 대입 구술면접자료집」 Ⅳ. 서류기반 및 인성면접 -> 대학별 예시문항 JSON

제시문 기반(Ⅱ·Ⅲ)은 제시문 본문이 있어야 의미가 있어 여기서는 다루지 않는다.
"""
import fitz, json, re, sys

SRC = r"C:\Users\황윤정\Downloads\2026학년도 대입 구술면접자료집(배포용).pdf"
OUT = sys.argv[1]

CTRL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
SECTION = "서류기반및인성면접"
RUNHEAD = ("서류기반및인성면접", "대입수시모집대비면접자료집",
           "인천광역시교육청", "진로진학지원단")
QNUM = re.compile(r"^\(?(\d{1,2})\)\s*")
OV_LABELS = {"면접방법", "면접문항", "(질문형식)", "면접시간", "전형방법", "평가영역", "기타",
             "면접유형", "면접내용", "반영비율"}


def clean(t):
    return re.sub(r"\s{2,}", " ", CTRL.sub("", t)).strip()


def smart_join(parts):
    out = ""
    for i, x in enumerate(parts):
        t = x.strip()
        if not t:
            continue
        out = t if not out else out + ("" if not parts[i - 1].endswith(" ") else " ") + t
    return clean(out)


def main():
    doc = fitz.open(SRC)
    data = {}          # univ -> {"overview": [...], "items": [...]}
    univ = group = ""
    buf = []
    ov_label = ""

    def flush_q():
        nonlocal buf
        if buf and univ:
            q = smart_join(buf)
            if len(q) >= 12:
                data[univ]["items"].append({"group": group, "q": q})
        buf = []

    # Ⅳ장 시작 페이지(큰 제목) 찾기 — 좌우 페이지의 머리말이 달라 머리말로는 구간을 못 잡는다
    start = None
    for pno in range(doc.page_count):
        for b in doc[pno].get_text("dict")["blocks"]:
            if b["type"] != 0:
                continue
            for l in b["lines"]:
                t = re.sub(r"\s+", "", CTRL.sub("", "".join(sp["text"] for sp in l["spans"])))
                if l["spans"][0]["size"] >= 24 and SECTION in t:
                    start = pno
        if start is not None:
            break
    if start is None:
        raise SystemExit("Ⅳ장을 찾지 못했습니다.")

    for pno in range(start, doc.page_count):
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
        # 다음 장(Ⅴ 등)이 시작되면 종료
        if pno > start and any(r["size"] >= 24 and not r["t"].strip().isdigit()
                               for r in rows):
            break
        for r in rows:
            t, x0, sz = r["t"], r["x0"], r["size"]
            s = t.strip()
            k0 = re.sub(r"\s+", "", s)
            if any(h in k0 for h in RUNHEAD) or re.fullmatch(r"\d{1,3}", s):
                continue
            if sz >= 15:
                # 대학 제목 (앞의 숫자는 별도 블록)
                name = re.sub(r"^\s*\d+\s*", "", s).strip()
                if name.endswith(("대학교", "대학", "과학기술원", "사관학교")):
                    flush_q()
                    univ, group, ov_label = name, "", ""
                    data.setdefault(univ, {"overview": [], "items": []})
                continue
            if not univ:
                continue
            if s.startswith("m") and len(s) < 40:
                flush_q()
                group = clean(s[1:])
                continue
            if QNUM.match(s) and x0 < 85:
                flush_q()
                buf = [QNUM.sub("", t.lstrip())]
                continue
            if buf:
                buf.append(t.lstrip())
                continue
            # 면접 개요 표
            k = re.sub(r"\s+", "", s)
            if x0 < 160 and k in OV_LABELS:
                ov_label = k
            elif x0 >= 160 and ov_label:
                data[univ]["overview"].append((ov_label, t))
    flush_q()

    out = []
    for u, d in data.items():
        ov, seen = [], {}
        for k, v in d["overview"]:
            seen.setdefault(k, []).append(v)
        for k, vs in seen.items():
            ov.append({"k": k, "v": smart_join(vs)})
        if d["items"]:
            out.append({"univ": u, "overview": ov, "items": d["items"]})

    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("univs:", len(out), "questions:", sum(len(x["items"]) for x in out))


main()
