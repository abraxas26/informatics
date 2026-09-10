# -*- coding: utf-8 -*-
"""파싱 결과를 웹앱용 데이터로 병합·정규화"""
import json, re, os, sys, unicodedata
from collections import defaultdict

SP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTDIR = sys.argv[1]

ulsan = json.load(open(os.path.join(SP, "ulsan.json"), encoding="utf-8"))
gn = json.load(open(os.path.join(SP, "gn.json"), encoding="utf-8"))
jin = json.load(open(os.path.join(SP, "jinsim_q.json"), encoding="utf-8"))
sej = json.load(open(os.path.join(SP, "sejong.json"), encoding="utf-8"))
gus = json.load(open(os.path.join(SP, "gusul.json"), encoding="utf-8"))
adm = json.load(open(os.path.join(SP, "sejong2027.json"), encoding="utf-8"))
sej20 = json.load(open(os.path.join(SP, "sejong2020.json"), encoding="utf-8"))
CB_FILES = ["cb_case1.json", "cb_case2.json", "cb_h2025.json",
            "cb_h2024.json", "cb_2022.json"]
cb = [r for f in CB_FILES
      for r in json.load(open(os.path.join(SP, f), encoding="utf-8"))]

ALIAS = {
    "가톨릭관동대": "가톨릭관동대학교", "강서대(케이씨대)": "강서대학교", "케이씨대": "강서대학교",
    "경상국립대": "경상국립대학교", "광주과학기술원": "GIST", "광주과학기술원(GIST)": "GIST",
    "한국과학기술원": "KAIST", "한국과학기술원(KAIST)": "KAIST", "카이스트": "KAIST",
    "울산과학기술원": "UNIST", "대구경북과학기술원": "DGIST", "포항공과대학교": "포스텍",
    "포항공대": "포스텍", "한국에너지공과대학교": "KENTECH",
    "CAU중앙대학교": "중앙대학교", "서울과기대": "서울과학기술대학교",
    "한국외대": "한국외국어대학교", "한양대(ERICA)": "한양대학교(ERICA)",
    "한양(ERICA)대학교": "한양대학교(ERICA)", "한양대에리카": "한양대학교(ERICA)",
    "한양대학교(에리카)": "한양대학교(ERICA)", "연세대(미래)": "연세대학교(미래)",
    "연세대학교(미래캠퍼스)": "연세대학교(미래)", "동국대(WISE)": "동국대학교(WISE)",
    "건국대(글로컬)": "건국대학교(글로컬)", "홍익대(세종캠퍼스)": "홍익대학교(세종)",
    "홍익대학교(세종캠퍼스)": "홍익대학교(세종)", "홍익대(서울)": "홍익대학교",
    "고려대학교(서울)": "고려대학교", "연세대학교(서울)": "연세대학교",
    "동국대학교(서울)": "동국대학교", "상명대학교(서울)": "상명대학교",
    "단국대학교(죽전)": "단국대학교", "차의과대학교": "차의과학대학교",
    "국립한국해양대": "국립한국해양대학교", "한국해양대학교": "국립한국해양대학교",
    "국립공주대": "국립공주대학교", "공주대학교": "국립공주대학교",
    "한국전통문화대": "한국전통문화대학교", "해군사관학고": "해군사관학교",
}
ALIAS.update({
    "힌국외대": "한국외국어대학교", "한국외대학교": "한국외국어대학교",
    "차의과대학": "차의과학대학교", "차의과대학교": "차의과학대학교",
    "울산과학기술원": "UNIST", "한국과학기술원": "KAIST", "광주과학기술원": "GIST",
    "대구경북과학기술원": "DGIST", "포항공과대학교": "포스텍",
})
BLOCK = {"사범대학", "사범대학교", "일반학과", "대학교", "대학", "전형", "학과"}
SUFFIX = [("여대", "여자대학교"), ("교대", "교육대학교"), ("대", "대학교")]

# 정식 교명 목록(울산 자료집 섹션 제목 + 경남 자료집 섹션 각주)은 깨끗하므로 기준으로 삼는다
CANON = set()

BAD_WORD = re.compile(r"전형|역량|우수|특기자|정시|수시|창의|일반|추천|인재|계열|전공|면접|학생부")
CLEAN = re.compile(r"[가-힣A-Za-z]{2,8}(?:대학교|대학|과학기술원|사관학교)$")

def _norm(name):
    n = unicodedata.normalize("NFC", (name or "")).strip()
    n = re.sub(r"\s+", "", n)
    return n.replace("대학교대학교", "대학교")

def canon(name):
    n = _norm(name)
    if not n or n in BLOCK:
        return ""
    if n in ALIAS:
        return ALIAS[n]
    if n in CANON:
        return n
    # 전형명 등이 앞뒤에 붙은 경우: 정식 교명을 부분 문자열로 찾아낸다
    keys = [k for k in list(CANON) + list(ALIAS) if len(k) >= 4 and k in n]
    if keys:
        best = max(keys, key=len)
        return ALIAS.get(best, best)
    for a, b in SUFFIX:
        if n.endswith(a):
            cand = ALIAS.get(n[: -len(a)] + b, n[: -len(a)] + b)
            return "" if cand in BLOCK else cand
    return "" if n in BLOCK else n

def learn_canon(names):
    """깨끗한 정식 교명만 기준 목록에 추가"""
    for raw in names:
        n = _norm(raw)
        if n and not BAD_WORD.search(n) and CLEAN.fullmatch(n) and n not in BLOCK:
            CANON.add(ALIAS.get(n, n))

def valid_univ(n):
    return bool(n) and (n.endswith(("대학교", "대학", "과학기술원", "사관학교"))
                        or n in ("GIST", "KAIST", "UNIST", "DGIST", "포스텍", "KENTECH"))

def clean_jh(t, name):
    t, name = (t or "").strip(), (name or "").strip()
    if t and name and name not in t:
        return "%s(%s)" % (t, name)
    return name or t


def norm_dept(d):
    d = re.sub(r"\s+", " ", (d or "")).strip()
    return d

learn_canon(r["univ"] for r in ulsan)
learn_canon(r.get("univ", "") for r in gn)
learn_canon(r.get("univ_raw", "") for r in gn)
learn_canon(it["univ"] for it in jin)
learn_canon(r["univ"] for r in sej)
learn_canon(x["univ"] for x in gus)
learn_canon(x["univ"] for x in adm)
learn_canon(r["univ"] for r in cb)
learn_canon(r["univ"] for r in sej20)
CANON |= {"GIST", "KAIST", "UNIST", "DGIST", "포스텍", "KENTECH"}
CANON -= BLOCK
# 2차: 약칭에서 복원된 교명도 기준 목록에 반영한 뒤 다시 정규화한다
_raw = ([r["univ"] for r in ulsan] + [r.get("univ", "") for r in gn]
        + [r.get("univ_raw", "") for r in gn] + [it["univ"] for it in jin]
        + [r["univ"] for r in sej] + [x["univ"] for x in gus]
        + [x["univ"] for x in adm] + [r["univ"] for r in cb]
        + [r["univ"] for r in sej20])
learn_canon(canon(x) for x in _raw)
CANON -= BLOCK

records = []
for r in ulsan:
    u = canon(r["univ"])
    if not valid_univ(u):
        continue
    records.append({
        "univ": u, "dept": norm_dept(r["dept"]), "jeonhyeong": r["jeonhyeong"],
        "method": r["method"], "notes": r["notes"], "qa": r["qa"],
        "src": "울산광역시교육청 「2025 대입 면접후기 자료집」", "year": "2025학년도",
    })
for r in gn:
    u = canon(r["univ_raw"]) or canon(r["univ"])
    if not valid_univ(u):
        u = canon(r["univ"])
    if not valid_univ(u):
        continue
    method = " / ".join(x for x in [r.get("면접유형", ""), r.get("면접절차", "")] if x)
    records.append({
        "univ": u, "dept": norm_dept(r["dept"]), "jeonhyeong": r["jeonhyeong"],
        "method": method, "notes": r.get("유의사항", ""), "qa": r["qa"],
        "naesin": r.get("naesin", ""), "result": r.get("result", ""),
        "resultNote": r.get("result_note", ""), "suneung": r.get("suneung", ""),
        "type": r.get("type", ""),
        "src": "경상남도교육청 「2026 대입 면접 전략 자료집(학생부 기반)」", "year": "2025학년도",
    })

QEND = re.compile(r"(\?|요\.?|오\.?|까\.?|나\.?|시오\.?|보세요\.?|주세요\.?)\s*$")
NOT_Q = re.compile(r"제시하지\s*않|참고 바랍|해당\s*없|미공개|자료집 참고")
SEJ_SRC = "세종특별자치시교육청 「보인다! 5.0 면접지도 길라잡이」"
for r in sej:
    u = canon(r["univ"])
    if not valid_univ(u) or not r["qa"]:
        continue
    method = " / ".join(x for x in [r.get("process", ""),
                                    ("면접시간 " + r["time"]) if r.get("time") else "",
                                    ("면접위원 " + r["panel"]) if r.get("panel") else ""] if x)
    records.append({
        "univ": u, "dept": norm_dept(r["dept"]),
        "jeonhyeong": clean_jh(r.get("type", ""), r.get("jeonhyeong", "")),
        "method": method, "notes": r.get("notes", ""), "qa": r["qa"],
        "src": SEJ_SRC, "year": "2024학년도",
    })

def norm_result(t):
    t = (t or "").strip()
    if not t or t in ("?", "-"):
        return ""
    if "불합" in t:
        return "불합격"
    if "추합" in t or "충원" in t or "예비" in t:
        return "추가합격"
    if "합" in t:
        return "합격"
    return ""


for r in cb:
    u = canon(r["univ"])
    if not valid_univ(u) or not r["qa"]:
        continue
    records.append({
        "univ": u, "dept": norm_dept(r["dept"]),
        "jeonhyeong": clean_jh(r.get("type", ""), r.get("jeonhyeong", "")),
        "method": r.get("method", ""), "notes": r.get("notes", ""), "qa": r["qa"],
        "result": norm_result(r.get("result", "")),
        "resultNote": (r.get("resultNote", "") or "").strip(" -"),
        "src": r["src"], "year": r["year"],
    })

SEJ20_SRC = "세종특별자치시교육청 「2020 보인다! 면접지도 길라잡이」"
for r in sej20:
    u = canon(r["univ"])
    if not valid_univ(u) or not r["qa"]:
        continue
    method = " / ".join(x for x in [r.get("process", ""),
                                    ("면접시간 " + r["time"]) if r.get("time") else "",
                                    ("면접위원 " + r["panel"]) if r.get("panel") else ""] if x)
    records.append({
        "univ": u, "dept": norm_dept(r["dept"]),
        "jeonhyeong": clean_jh(r.get("type", ""), r.get("jeonhyeong", "")),
        "method": method, "notes": r.get("notes", ""), "qa": r["qa"],
        "src": SEJ20_SRC, "year": "2020학년도",
    })

official = defaultdict(list)
for it in jin:
    u = canon(it["univ"])
    q = it["q"].strip()
    if not valid_univ(u) or NOT_Q.search(q) or not QEND.search(q) or len(q) < 12:
        continue
    cat = it["category"].strip()
    if len(cat) > 18 or not cat:
        cat = ""
    official[u].append({"category": cat, "jeonhyeong": it.get("jeonhyeong", ""), "q": q,
                        "src": "경기도 진학 연구팀(진심) 「2026 면접을 준비하다」"})

GUS_SRC = "인천광역시교육청 「2026학년도 대입 구술면접자료집」"
for x in gus:
    u = canon(x["univ"])
    if not valid_univ(u):
        continue
    for it in x["items"]:
        q = it["q"].strip()
        if len(q) < 12 or NOT_Q.search(q):
            continue
        official[u].append({"category": it.get("group", ""), "jeonhyeong": "", "q": q,
                            "src": GUS_SRC})

ADM_SRC = "세종특별자치시교육청 「2027학년도 대입 수시모집 면접 전형 자료집」"
admission = defaultdict(list)
for x in adm:
    u = canon(x["univ"])
    if not valid_univ(u):
        continue
    admission[u].append({
        "jeonhyeong": x["jeonhyeong"], "select": x.get("select", ""),
        "type": x.get("type", ""), "method": x.get("method", ""),
        "schedule": x.get("schedule", ""), "notes": x.get("notes", ""),
        "areas": x.get("areas", []),
    })
    for a in x.get("areas", []):
        for q in a["questions"]:
            if len(q) >= 12 and not NOT_Q.search(q):
                official[u].append({"category": a["area"], "jeonhyeong": x["jeonhyeong"],
                                    "q": q, "src": ADM_SRC})

# 대학별 묶기
by_univ = defaultdict(list)
for r in records:
    by_univ[r["univ"]].append(r)

os.makedirs(os.path.join(OUTDIR, "univ"), exist_ok=True)
index = []
for i, (u, recs) in enumerate(sorted(by_univ.items(), key=lambda x: x[0]), 1):
    slug = "u%03d" % i
    depts = sorted({r["dept"] for r in recs if r["dept"]})
    payload = {"univ": u, "reviews": recs, "official": official.get(u, []),
               "admission": admission.get(u, [])}
    json.dump(payload, open(os.path.join(OUTDIR, "univ", slug + ".json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    index.append({"name": u, "slug": slug, "reviews": len(recs),
                  "questions": sum(len(r["qa"]) for r in recs),
                  "official": len(official.get(u, [])),
                  "admission": len(admission.get(u, [])), "depts": depts})
# 후기는 없고 공식 예시문항만 있는 대학
extra = sorted(set(official) | set(admission))
for i, u in enumerate(extra, len(index) + 1):
    if u in by_univ:
        continue
    slug = "u%03d" % i
    json.dump({"univ": u, "reviews": [], "official": official.get(u, []),
               "admission": admission.get(u, [])},
              open(os.path.join(OUTDIR, "univ", slug + ".json"), "w", encoding="utf-8"),
              ensure_ascii=False, separators=(",", ":"))
    index.append({"name": u, "slug": slug, "reviews": 0, "questions": 0,
                  "official": len(official.get(u, [])),
                  "admission": len(admission.get(u, [])), "depts": []})

index.sort(key=lambda x: x["name"])
json.dump({
    "generatedAt": "2026-09-10",
    "sources": [
        "울산광역시교육청 「2025 대입 면접후기 자료집」",
        "경상남도교육청 「2026학년도 대입을 위한 면접 전략 자료집[학생부 기반]」",
        "세종특별자치시교육청 「보인다! 5.0 면접지도 길라잡이」",
        "인천광역시교육청 「2026학년도 대입 구술면접자료집」",
        "경기도 진학 연구팀(진심) 「2026 면접을 준비하다」",
        "세종특별자치시교육청 「2027학년도 대입 수시모집 면접 전형 자료집」",
        "세종특별자치시교육청 「2020 보인다! 면접지도 길라잡이」",
        "충청북도교육청 「2025 수시 면접 사례집(1·2권)」",
        "충청북도교육청 「2025 대입 면접 후기집」",
        "충청북도교육청 「2024 수시 대비 면접 후기집」",
        "충청북도교육청 「2022 대입 면접 후기집」",
    ],
    "totals": {"universities": len(index),
               "admission": sum(x.get("admission", 0) for x in index),
               "reviews": sum(x["reviews"] for x in index),
               "questions": sum(x["questions"] for x in index),
               "official": sum(x["official"] for x in index)},
    "universities": index,
}, open(os.path.join(OUTDIR, "index.json"), "w", encoding="utf-8"),
    ensure_ascii=False, separators=(",", ":"))

print("univs:", len(index), "reviews:", sum(x["reviews"] for x in index),
      "qa:", sum(x["questions"] for x in index), "official:", sum(x["official"] for x in index))
