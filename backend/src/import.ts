import {
  BadRequestException, Controller, Param, Post, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { parse } from 'csv-parse/sync';
import { JwtGuard } from './auth';
import { Category, Currency } from './entities';
import { SyncService } from './sync';

/** products.csv header -> API field. Accepts both the export names and the original Access names. */
const PRODUCT_HEADERS: Record<string, string> = {
  external_id: 'externalId', 'КодТовара': 'externalId',
  barcode: 'barcode', 'ШтрихКод': 'barcode',
  category_id: 'categoryExternalId', 'КодТипа': 'categoryExternalId',
  name: 'name', 'Марка': 'name',
  brand: 'brand', 'Производитель': 'brand',
  unit: 'unit', 'ЕдиницаИзмерения': 'unit',
  price: 'price', 'Цена': 'price',
  currency_id: 'currencyExternalId', 'КодВалюты': 'currencyExternalId',
  quantity: 'quantity', 'ОстатокНВС': 'quantity',
  in_price_list: 'inPriceList', 'Прайс-Лист': 'inPriceList',
  discontinued: 'discontinued', 'ПоставкиПрекращены': 'discontinued',
  description: 'note', 'Примечание': 'note',
  weight: 'weight', 'Вес': 'weight',
  volume: 'volume', 'Объем': 'volume',
};
const CHUNK = 1000;

/** UTF-8 (with or without BOM); falls back to Windows-1251 if the file is not valid UTF-8 (Excel "Save as CSV"). */
function decode(buf: Buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1251').decode(buf);
  }
}

function readCsv(buf: Buffer) {
  const text = decode(buf);
  const firstLine = text.slice(0, text.indexOf('\n') >>> 0);
  const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = parse(text, { delimiter, relax_column_count: true, skip_empty_lines: true, bom: true });
  if (rows.length < 1) throw new BadRequestException('Empty file');
  const header = rows[0].map((h) => h.trim());
  const data = rows.slice(1).map((r) => {
    const o: Record<string, string | null> = {};
    header.forEach((h, i) => { o[h] = r[i] === undefined || r[i] === '' ? null : r[i]; });
    return o;
  });
  return { header, data };
}

/** Lookup tables: id = first column, name = first other column that holds text (not numbers). */
function lookupColumns(header: string[], data: Record<string, string | null>[]) {
  const id = header[0];
  const name = header.slice(1).find((h) => {
    const vals = data.slice(0, 50).map((r) => r[h]).filter(Boolean) as string[];
    return vals.length > 0 && vals.filter((v) => Number.isNaN(Number(v.replace(',', '.')))).length > vals.length / 2;
  });
  return { id, name };
}

@Controller('admin/import')
@UseGuards(JwtGuard)
export class ImportController {
  constructor(private sync: SyncService) {}

  @Post(':kind')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async import(@Param('kind') kind: string, @UploadedFile() file?: { buffer: Buffer }) {
    if (!file) throw new BadRequestException('No file uploaded');
    const { header, data } = readCsv(file.buffer);

    if (kind === 'products') {
      const mapped = header.filter((h) => PRODUCT_HEADERS[h]);
      if (!mapped.some((h) => PRODUCT_HEADERS[h] === 'externalId')) {
        throw new BadRequestException(`products.csv must have a column external_id or КодТовара. Found: ${header.join(', ')}`);
      }
      const items = data.map((r) => {
        const o: Record<string, unknown> = {};
        for (const h of mapped) o[PRODUCT_HEADERS[h]] = r[h];
        return o;
      }).filter((o) => o.externalId);
      let n = 0;
      for (let i = 0; i < items.length; i += CHUNK) {
        n += (await this.sync.products({ batchId: `admin-csv-${i}`, agentVersion: 'admin-csv', upserts: items.slice(i, i + CHUNK) })).upserted;
      }
      return { kind, rows: data.length, imported: n, columns: mapped, ignored: header.filter((h) => !PRODUCT_HEADERS[h]) };
    }

    if (kind === 'categories' || kind === 'currencies') {
      const { id, name } = lookupColumns(header, data);
      const items = data.filter((r) => r[id]).map((r) => ({ externalId: r[id], name: name ? r[name] : '', raw: r }));
      let n = 0;
      for (let i = 0; i < items.length; i += CHUNK) {
        n += (await this.sync.lookup(kind === 'categories' ? Category : Currency, kind,
          { batchId: `admin-csv-${i}`, agentVersion: 'admin-csv', upserts: items.slice(i, i + CHUNK) })).upserted;
      }
      return { kind, rows: data.length, imported: n, idColumn: id, nameColumn: name ?? null };
    }

    throw new BadRequestException('kind must be products, categories or currencies');
  }
}
