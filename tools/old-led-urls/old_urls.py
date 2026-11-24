"""Read old led.am products/categories (ids, Access m_id, aliases) from the MySQL dump. Usage: python old_urls.py dump.sql out.json"""
import json
import re
import sys

STR = r"'(?:[^'\\]|\\.)*'"
P = re.compile(r"^\((\d+), (NULL|" + STR + r"), (\d+), (\d+), (-?\d+), (NULL|" + STR + r")")
C = re.compile(r"^\((\d+), (\d+), (\d+), (-?\d+), (" + STR + r")")
ML = re.compile(r"^\((\d+), (\d+), (" + STR + r")")

cur = None
rows, cats, cml = [], [], []
with open(sys.argv[1], encoding="utf-8", errors="replace") as f:
    for line in f:
        if line.startswith("INSERT INTO"):
            cur = line.split("`")[1]
            continue
        if not line.startswith("("):
            continue
        if cur == "s1_product":
            m = P.match(line)
            if m: rows.append(m.groups())
        elif cur == "s1_category":
            m = C.match(line)
            if m: cats.append(m.groups())
        elif cur == "s1_category_ml":
            m = ML.match(line)
            if m: cml.append(m.groups())

uq = lambda s: None if s in ("NULL", "''") else s.strip("'")
products = [{"id": int(r[0]), "m_id": uq(r[1]), "cat": int(r[2]), "active": r[3] == "1", "alias": uq(r[5])} for r in rows]
categories = [{"id": int(r[0]), "pid": int(r[1]), "active": r[2] == "1", "alias": uq(r[4])} for r in cats]
names = [{"id": int(r[0]), "lng": int(r[1]), "name": uq(r[2])} for r in cml]
json.dump({"products": products, "categories": categories, "names": names}, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False)
print("products", len(products), "categories", len(categories), "names", len(names))
print("12801:", [p for p in products if p["id"] == 12801])
withm = [p for p in products if p["m_id"]]
print("with m_id", len(withm), "active", sum(p["active"] for p in products), "active with m_id", sum(p["active"] for p in withm))
print("m_id samples", [p["m_id"] for p in withm[:8]])
print("categories sample", categories[:6])
