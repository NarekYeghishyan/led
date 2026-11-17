"""
Export the Access database (D:\\LED\\Data.mdb) to ONE CSV file
for importing into a website admin panel.

Usage:
    python export_access_to_csv.py                # export TABLE (default: Товары) -> one CSV
    python export_access_to_csv.py Клиенты        # export another table instead
    python export_access_to_csv.py --list         # list all tables
    python export_access_to_csv.py --columns      # show columns of TABLE (to map them for the site)
    python export_access_to_csv.py --columns Типы # show columns of another table

To export a JOIN of several tables (e.g. products + categories), put SQL in CUSTOM_SQL below.

Requires: pip install pyodbc  (+ Microsoft Access ODBC driver, same bitness as Python)
"""

import csv
import datetime
import decimal
import os
import sys

import pyodbc

# ---------------- Settings ----------------
# DB path and password are read from config.ini (the same file the sync agent uses)
import configparser
_cfg = configparser.ConfigParser(interpolation=None)
_cfg.read(os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.ini"), encoding="utf-8")
DB_PATH = _cfg.get("access", "db_path", fallback=r"D:\LED\Data.mdb")
DB_PASSWORD = _cfg.get("access", "password", fallback="")
OUTPUT_DIR = r"D:\python-script"
OUTPUT_FILE = "products.csv"

TABLE = "Товары"          # table to export

# Optional: only these columns, renamed for the website: {"Access column": "site column"}.
# Leave empty {} to export all columns with their original names.
COLUMNS = {
    "КодТовара": "external_id",
    "ШтрихКод": "barcode",
    "КодТипа": "category_id",          # -> table Типы
    "Марка": "name",
    "Производитель": "brand",
    "ЕдиницаИзмерения": "unit",
    "Цена": "price",
    "КодВалюты": "currency_id",        # -> table Валюты
    "НаСкладе": "quantity",
    "Прайс-Лист": "in_price_list",
    "ПоставкиПрекращены": "discontinued",
    "Примечание": "description",
    "Вес": "weight",
    "Объем": "volume",
    # NOT exported on purpose (internal): ЦенаНаНас, Надбавка, Диллерская цена1/2,
    # Бух*, ОстатокНВС, МинимальныйЗапас, Log, ЦенаПрайса, Марка2, ЕдиницаИзмерения2, Правый, ClearText
}

# Optional: your own query (overrides TABLE/COLUMNS), e.g. a JOIN:
# CUSTOM_SQL = "SELECT t.[Код] AS sku, t.[Название] AS name, g.[Название] AS category " \
#              "FROM [Товары] t LEFT JOIN [Группы] g ON t.[КодГруппы] = g.[Код]"
CUSTOM_SQL = ""

CSV_ENCODING = "utf-8"    # web admin panels expect UTF-8 (use "utf-8-sig" to open in Excel)
CSV_DELIMITER = ","       # standard CSV for web imports
BATCH_SIZE = 5000
# ------------------------------------------


def connect():
    conn_str = (
        r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};"
        rf"DBQ={DB_PATH};"
        rf"PWD={DB_PASSWORD};"
    )
    return pyodbc.connect(conn_str)


def list_tables(conn):
    cur = conn.cursor()
    names = [t.table_name for t in cur.tables(tableType="TABLE")]
    cur.close()
    return names


def format_value(v):
    if v is None:
        return ""
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S") if (v.hour or v.minute or v.second) else v.strftime("%Y-%m-%d")
    if isinstance(v, (datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return format(v.normalize(), "f") if v == v.to_integral() else format(v, "f")
    if isinstance(v, float):
        return repr(v).rstrip("0").rstrip(".") if "." in repr(v) else repr(v)
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (bytes, bytearray, memoryview)):
        return ""  # skip binary/OLE (images etc.) – not importable as text
    if isinstance(v, str):
        return v.replace("\r\n", "\n").strip()
    return v


def build_query(table):
    if CUSTOM_SQL:
        return CUSTOM_SQL
    if COLUMNS:
        cols = ", ".join(f"[{src}] AS [{dst}]" for src, dst in COLUMNS.items())
        return f"SELECT {cols} FROM [{table}]"
    return f"SELECT * FROM [{table}]"


def export(conn, table):
    cur = conn.cursor()
    cur.execute(build_query(table))
    columns = [d[0] for d in cur.description]

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    path = os.path.join(OUTPUT_DIR, OUTPUT_FILE)
    count = 0
    with open(path, "w", newline="", encoding=CSV_ENCODING) as f:
        writer = csv.writer(f, delimiter=CSV_DELIMITER, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(columns)
        while True:
            rows = cur.fetchmany(BATCH_SIZE)
            if not rows:
                break
            writer.writerows([format_value(v) for v in row] for row in rows)
            count += len(rows)
    cur.close()
    return path, count


def main():
    args = sys.argv[1:]
    table = next((a for a in args if not a.startswith("--")), TABLE)

    conn = connect()
    try:
        if "--list" in args:
            for t in list_tables(conn):
                print(t)
            return

        if "--columns" in args:
            cur = conn.cursor()
            for c in cur.columns(table=table):
                print(f"{c.column_name:30} {c.type_name}")
            cur.close()
            return

        if not CUSTOM_SQL and table not in list_tables(conn):
            print(f"Table not found: {table}. Use --list to see tables.")
            sys.exit(1)

        path, n = export(conn, table)
        print(f"OK: {n} rows -> {path}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
