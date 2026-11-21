/**
 * Old led.am customers + orders import. Run inside the api container:
 *   docker compose exec api node dist/legacy-cli.js /tmp/led_new.sql
 * Safe to repeat (final run when the new site goes live).
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { importLegacy } from './legacy';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node dist/legacy-cli.js <dump.sql>');
  if (!process.env.DATABASE_URL) throw new Error('Missing env DATABASE_URL');
  const ds = await new DataSource({ type: 'postgres', url: process.env.DATABASE_URL }).initialize();
  try {
    const [{ n }] = await ds.query(`SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'customers'`);
    if (!n) throw new Error('Table customers does not exist yet — start the new api version first (it runs migrations).');
    const stats = await importLegacy(ds, file, (s) => console.log(s));
    console.log(JSON.stringify(stats, null, 2));
  } catch (e) {
    await ds.query(`INSERT INTO customer_import_log (file, error) VALUES ($1, $2)`, [file, String((e as Error).message)]).catch(() => {});
    throw e;
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
