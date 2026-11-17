"""
LED Computers sync agent: Microsoft Access (Data.mdb) -> website API.

Runs on the store's Windows Server. Every few seconds it reads the synced tables,
compares each row with the previous state (hash per row, stored in SQLite) and
sends only new/changed/deleted rows to https://<site>/api/sync/*.
If the website is unreachable, nothing is marked as sent, so changes are retried later.

Usage:
    python agent.py            # run forever (normal mode / Windows service)
    python agent.py --once     # one sync pass, then exit
    python agent.py --full     # forget state and resend everything, then keep running
    python agent.py --check    # test Access + API connection and print what would be sent

Config: config.ini next to this file (copy config.example.ini).
"""

import configparser
import datetime
import decimal
import hashlib
import json
import logging
import logging.handlers
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import uuid

import pyodbc

VERSION = "0.1.0"
HERE = os.path.dirname(os.path.abspath(__file__))
log = logging.getLogger("agent")


# --------------------------------------------------------------------------- config

def load_config():
    path = os.path.join(HERE, "config.ini")
    if not os.path.exists(path):
        sys.exit(f"Missing {path}. Copy config.example.ini to config.ini and fill it in.")
    cfg = configparser.ConfigParser(interpolation=None)
    cfg.read(path, encoding="utf-8")
    return cfg


def setup_logging(cfg):
    log_dir = cfg.get("agent", "log_dir", fallback=os.path.join(HERE, "logs"))
    os.makedirs(log_dir, exist_ok=True)
    fmt = logging.Formatter("%(asctime)s %(levelname)s %(message)s")
    fh = logging.handlers.RotatingFileHandler(
        os.path.join(log_dir, "agent.log"), maxBytes=5_000_000, backupCount=5, encoding="utf-8")
    fh.setFormatter(fmt)
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    log.addHandler(fh)
    log.addHandler(sh)
    log.setLevel(logging.INFO)


# --------------------------------------------------------------------------- Access

def connect_access(cfg):
    conn_str = (
        r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};"
        f"DBQ={cfg.get('access', 'db_path')};"
        f"PWD={cfg.get('access', 'password')};"
        "ReadOnly=1;"
    )
    return pyodbc.connect(conn_str, readonly=True, autocommit=True)


def plain(v):
    """Convert an Access value to something JSON can hold."""
    if v is None:
        return None
    if isinstance(v, (datetime.datetime, datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return None  # binary/OLE fields are not synced
    if isinstance(v, str):
        return v.replace("\r\n", "\n").strip()
    return v


def read_table(conn, table):
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM [{table}]")
    cols = [d[0] for d in cur.description]
    rows = [dict(zip(cols, (plain(v) for v in r))) for r in cur.fetchall()]
    cur.close()
    return cols, rows


def pick(row, name):
    return row.get(name) if name else None


# Products: Access column -> API field. Internal columns (ЦенаНаНас, Надбавка,
# Диллерская цена, Бух*, Log, ...) are never sent, not even in "raw".
PRODUCT_MAP = {
    "КодТовара": "externalId",
    "ШтрихКод": "barcode",
    "КодТипа": "categoryExternalId",
    "Марка": "name",
    "Производитель": "brand",
    "ЕдиницаИзмерения": "unit",
    "Цена": "price",
    "КодВалюты": "currencyExternalId",
    "НаСкладе": "quantity",
    "Прайс-Лист": "inPriceList",
    "ПоставкиПрекращены": "discontinued",
    "Примечание": "note",
    "Вес": "weight",
    "Объем": "volume",
}
PRODUCT_RAW = ["ЦенаПрайса", "Марка2", "ЕдиницаИзмерения2", "МинимальныйЗапас"]


def map_products(rows):
    out = {}
    for r in rows:
        item = {api: r.get(col) for col, api in PRODUCT_MAP.items()}
        item["raw"] = {k: r.get(k) for k in PRODUCT_RAW if k in r}
        if item["externalId"] is not None:
            out[str(item["externalId"])] = item
    return out


def guess_lookup_columns(cols, rows, id_col, name_col):
    """For Типы / Валюты: use configured columns, else first column = id, first text column = name."""
    if not id_col:
        id_col = cols[0]
    if not name_col:
        sample = rows[0] if rows else {}
        name_col = next((c for c in cols if c != id_col and isinstance(sample.get(c), str)), None)
    return id_col, name_col


def map_lookup(cols, rows, id_col, name_col):
    id_col, name_col = guess_lookup_columns(cols, rows, id_col, name_col)
    out = {}
    for r in rows:
        ext = r.get(id_col)
        if ext is None:
            continue
        out[str(ext)] = {"externalId": ext, "name": pick(r, name_col) or "", "raw": r}
    return out


# --------------------------------------------------------------------------- state

class State:
    """Remembers the hash of every row already sent, per entity."""

    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute("CREATE TABLE IF NOT EXISTS sent (entity TEXT, ext_id TEXT, hash TEXT, PRIMARY KEY (entity, ext_id))")
        self.db.commit()

    def load(self, entity):
        return dict(self.db.execute("SELECT ext_id, hash FROM sent WHERE entity=?", (entity,)))

    def save(self, entity, upserts, deletes):
        self.db.executemany("INSERT OR REPLACE INTO sent VALUES (?,?,?)", [(entity, k, h) for k, h in upserts])
        self.db.executemany("DELETE FROM sent WHERE entity=? AND ext_id=?", [(entity, k) for k in deletes])
        self.db.commit()

    def clear(self):
        self.db.execute("DELETE FROM sent")
        self.db.commit()


def row_hash(item):
    return hashlib.sha1(json.dumps(item, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------- API

class Api:
    def __init__(self, cfg):
        self.base = cfg.get("api", "url").rstrip("/")
        self.key = cfg.get("api", "key")
        self.timeout = cfg.getint("api", "timeout", fallback=30)

    def call(self, method, path, body=None):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = urllib.request.Request(self.base + path, data=data, method=method, headers={
            "X-Api-Key": self.key,
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": f"led-sync-agent/{VERSION}",
        })
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return json.loads(resp.read().decode("utf-8") or "null")
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {e.read()[:300]!r}") from None


# --------------------------------------------------------------------------- sync

def sync_entity(api, state, entity, current, batch_size, dry_run=False):
    """Send rows of `current` ({ext_id: item}) that differ from the saved state."""
    old = state.load(entity)
    hashes = {k: row_hash(v) for k, v in current.items()}
    changed = [k for k, h in hashes.items() if old.get(k) != h]
    deleted = [k for k in old if k not in current]
    if dry_run:
        log.info("%s: %d rows, would send %d upserts, %d deletes", entity, len(current), len(changed), len(deleted))
        return 0
    if not changed and not deleted:
        return 0

    for i in range(0, max(len(changed), 1), batch_size):
        part = changed[i:i + batch_size]
        dels = deleted if i == 0 else []
        if not part and not dels:
            break
        api.call("POST", f"/sync/{entity}", {
            "batchId": f"{datetime.datetime.now():%Y%m%d%H%M%S}-{uuid.uuid4().hex[:8]}",
            "agentVersion": VERSION,
            "upserts": [current[k] for k in part],
            "deletes": dels,
        })
        state.save(entity, [(k, hashes[k]) for k in part], dels)  # only after the server accepted it
    log.info("%s: sent %d upserts, %d deletes", entity, len(changed), len(deleted))
    return len(changed) + len(deleted)


def sync_pass(cfg, api, state, include_lookups, dry_run=False):
    batch = cfg.getint("agent", "batch_size", fallback=500)
    conn = connect_access(cfg)
    try:
        if include_lookups:
            for entity, sec in (("categories", "categories"), ("currencies", "currencies")):
                table = cfg.get(sec, "table", fallback="")
                if not table:
                    continue
                cols, rows = read_table(conn, table)
                data = map_lookup(cols, rows, cfg.get(sec, "id_column", fallback=""), cfg.get(sec, "name_column", fallback=""))
                sync_entity(api, state, entity, data, batch, dry_run)
        _, rows = read_table(conn, cfg.get("products", "table", fallback="Товары"))
        sync_entity(api, state, "products", map_products(rows), batch, dry_run)
    finally:
        conn.close()


def main():
    args = sys.argv[1:]
    cfg = load_config()
    setup_logging(cfg)
    api = Api(cfg)
    state = State(cfg.get("agent", "state_file", fallback=os.path.join(HERE, "state.sqlite")))

    if "--check" in args:
        log.info("API status: %s", api.call("GET", "/sync/status"))
        sync_pass(cfg, api, state, include_lookups=True, dry_run=True)
        return
    if "--full" in args:
        log.info("Full resync: clearing local state")
        state.clear()

    interval = cfg.getint("agent", "interval_seconds", fallback=5)
    lookup_every = cfg.getint("agent", "lookup_interval_seconds", fallback=120)
    last_lookup = 0.0
    errors = 0
    log.info("Agent %s started, interval %ss, API %s", VERSION, interval, api.base)

    while True:
        started = time.time()
        try:
            include_lookups = started - last_lookup >= lookup_every
            sync_pass(cfg, api, state, include_lookups)
            if include_lookups:
                last_lookup = started
            errors = 0
        except Exception as e:  # keep running: network down, mdb locked, etc.
            errors += 1
            log.error("Sync failed (%d in a row): %s", errors, e)
        if "--once" in args:
            return
        # back off up to 2 minutes while errors continue
        wait = interval if errors == 0 else min(120, interval * (2 ** min(errors, 5)))
        time.sleep(max(1, wait - (time.time() - started)))


if __name__ == "__main__":
    main()
