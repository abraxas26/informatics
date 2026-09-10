# -*- coding: utf-8 -*-
"""빌드된 JSON 데이터를 <script>로 읽을 수 있는 .js 로 변환한다.

file:// 로 직접 열었을 때 fetch() 가 CORS 로 막히기 때문에,
데이터를 전역 변수에 담는 스크립트 파일로 내보내 <script src> 로 불러온다.
"""
import json, os, sys, glob

DATA = sys.argv[1]
HEAD = "window.IV=window.IV||{};"


def write_js(path, expr):
    with open(path, "w", encoding="utf-8") as f:
        f.write(HEAD + expr + "\n")


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def convert(name, var):
    src = os.path.join(DATA, name + ".json")
    if not os.path.exists(src):
        return 0
    obj = json.load(open(src, encoding="utf-8"))
    write_js(os.path.join(DATA, name + ".js"), "IV.%s=%s;" % (var, dump(obj)))
    os.remove(src)
    return 1


convert("index", "index")
convert("common", "common")
convert("qindex", "qindex")

n = 0
for src in sorted(glob.glob(os.path.join(DATA, "univ", "*.json"))):
    slug = os.path.splitext(os.path.basename(src))[0]
    obj = json.load(open(src, encoding="utf-8"))
    write_js(os.path.join(DATA, "univ", slug + ".js"),
             "IV.univ=IV.univ||{};IV.univ[%s]=%s;" % (dump(slug), dump(obj)))
    os.remove(src)
    n += 1

print("converted: index/common/qindex + %d univ files" % n)
