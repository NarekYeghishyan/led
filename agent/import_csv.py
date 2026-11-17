"""
First load: import the CSV files made by `export_access_to_csv.py --site` into the website.

    python import_csv.py                 # reads products.csv, Типы.csv, Валюты.csv from the export folder
    python import_csv.py D:\\python-script

Uses the same API and key as the sync agent (config.ini [api]). Safe to run again:
rows are updated by their code, never duplicated. After this, start the agent; it only sends changes.
"""

import csv
import os
import sys

from agent import Api, load_config, map_lookup

BATCH = 500

# products.csv header (from export COLUMNS) -> API field
PRODUCT_FIELDS = {
    "external_id": "externalId", "barcode": "barcode", "category_id": "categoryExternalId",
    "name": "name", "brand": "brand", "unit": "unit", "price": "price", "currency_id": "currencyExternalId",
    "quantity": "quantity", "in_price_list": "inPriceList", "discontinued": "discontinued",
    "description": "note", "weight": "weight", "volume": "volume",
}


def read_csv(path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        return reader.fieldnames or [], [{k: (v if v != "" else None) for k, v in r.items()} for r in reader]


def send(api, entity, items):
    for i in range(0, len(items), BATCH):
        api.call("POST", f"/sync/{entity}", {"batchId": f"csv-import-{i}", "agentVersion": "csv-import", "upserts": items[i:i + BATCH]})
        print(f"  {entity}: {min(i + BATCH, len(items))}/{len(items)}")


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else r"D:\python-script"
    cfg = load_config()
    api = Api(cfg)
    print("API:", api.call("GET", "/sync/status"))

    for entity, sec in (("categories", "categories"), ("currencies", "currencies")):
        table = cfg.get(sec, "table", fallback="")
        path = os.path.join(folder, f"{table}.csv")
        if not table or not os.path.exists(path):
            print(f"skip {entity}: {path} not found")
            continue
        cols, rows = read_csv(path)
        data = map_lookup(cols, rows, cfg.get(sec, "id_column", fallback=""), cfg.get(sec, "name_column", fallback=""))
        send(api, entity, list(data.values()))

    path = os.path.join(folder, "products.csv")
    _, rows = read_csv(path)
    items = [{api_f: r.get(col) for col, api_f in PRODUCT_FIELDS.items()} for r in rows if r.get("external_id")]
    send(api, "products", items)
    print("Done:", api.call("GET", "/sync/status"))


if __name__ == "__main__":
    main()
