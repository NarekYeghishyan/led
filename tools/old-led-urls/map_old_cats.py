"""Old led.am category → new site category path, by where the old category's products sit now.
Usage: python map_old_cats.py old.json placed.tsv sitecats.tsv out.sql report.tsv"""
import collections
import json
import re
import sys

old = json.load(open(sys.argv[1], encoding="utf-8"))
placed = collections.defaultdict(set)
for line in open(sys.argv[2], encoding="utf-8"):
    code, cat = line.rstrip("\n").split("\t")
    placed[int(code)].add(int(cat))
site = {}
for line in open(sys.argv[3], encoding="utf-8"):
    i, pid, slug, vis, name = line.rstrip("\n").split("\t")
    site[int(i)] = {"pid": int(pid) or None, "slug": slug, "vis": vis == "t", "name": name}


def chain(cid):  # root → cid, None if hidden anywhere
    out = []
    while cid:
        c = site.get(cid)
        if not c or not c["vis"]:
            return None
        out.insert(0, cid)
        cid = c["pid"]
    return out


path = lambda ids: "/" + "/".join(site[i]["slug"] for i in ids)

# old tree
ocat = {c["id"]: c for c in old["categories"]}
kids = collections.defaultdict(list)
for c in old["categories"]:
    kids[c["pid"]].append(c["id"])
name = {}
for n in old["names"]:
    if n["lng"] == 1 or n["id"] not in name:
        name[n["id"]] = n["name"]
codes = collections.defaultdict(set)
for p in old["products"]:
    m = re.search(r"_(\d{1,7})$", p["alias"] or "")
    if m:
        codes[p["cat"]].add(int(m.group(1)))


def subtree(cid, seen=None):
    seen = seen or set()
    if cid in seen:
        return set()
    seen.add(cid)
    s = set(codes[cid])
    for k in kids[cid]:
        s |= subtree(k, seen)
    return s


result = {}
for c in old["categories"]:
    votes, n = collections.Counter(), 0
    for code in subtree(c["id"]):
        best = None
        for sc in placed.get(code, ()):  # deepest visible placement of this product
            ch = chain(sc)
            if ch and (best is None or len(ch) > len(best)):
                best = ch
        if best:
            n += 1
            for k in range(1, len(best) + 1):
                votes[tuple(best[:k])] += 1
    pick = None
    if n:
        ok = [ids for ids, v in votes.items() if v >= 0.6 * n]
        pick = max(ok, key=len) if ok else None
    result[c["id"]] = (path(pick) if pick else None, n)

# no products / no majority → the old parent's target, else the catalog page
def target(cid, depth=0):
    t, n = result[cid]
    if t:
        return t, n, "products"
    pid = ocat[cid]["pid"]
    if pid in ocat and depth < 10:
        t2, _, _ = target(pid, depth + 1)
        return t2, n, "parent"
    return "/catalog", n, "none"


sql, rep, seen = [], ["old_alias\tactive\told_name\tproducts_matched\thow\tnew_path"], set()
for c in sorted(old["categories"], key=lambda c: c["id"]):
    alias = (c["alias"] or "").strip().lower()
    if not alias or alias in seen:
        continue
    seen.add(alias)
    t, n, how = target(c["id"])
    frm = f"/products/category/{alias}"
    nm = (name.get(c["id"]) or "").replace("'", "''")[:120]
    sql.append(f"('{frm.replace(chr(39), chr(39) * 2)}', '{t}', 'old-led', 'old led.am category {c['id']} {nm}')")
    rep.append(f"{alias}\t{c['active']}\t{name.get(c['id'], '')}\t{n}\t{how}\t{t}")
open(sys.argv[4], "w", encoding="utf-8").write(
    "INSERT INTO url_redirects (from_path, to_path, source, note) VALUES\n" + ",\n".join(sql) +
    "\nON CONFLICT (from_path) DO UPDATE SET to_path = EXCLUDED.to_path, note = EXCLUDED.note WHERE url_redirects.source = 'old-led';\n")
open(sys.argv[5], "w", encoding="utf-8").write("\n".join(rep) + "\n")
hows = collections.Counter(r.split("\t")[4] for r in rep[1:])
print(len(sql), "old categories;", dict(hows))
