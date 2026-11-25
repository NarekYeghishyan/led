import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

/** Fields marked "Access" are written only by the sync agent. "Web" fields only by the admin panel. */

const numeric = { from: (v: string | null) => (v === null ? null : Number(v)), to: (v: unknown) => v };

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn() id: number;
  @Index({ unique: true }) @Column({ name: 'external_id', type: 'int' }) externalId: number; // Access
  @Column({ type: 'text', default: '' }) name: string; // Access
  @Column({ type: 'jsonb', default: {} }) raw: Record<string, unknown>; // Access
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt: Date | null;
  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true }) syncedAt: Date | null;
}

@Entity('currencies')
export class Currency {
  @PrimaryGeneratedColumn() id: number;
  @Index({ unique: true }) @Column({ name: 'external_id', type: 'int' }) externalId: number;
  @Column({ type: 'text', default: '' }) name: string;
  @Column({ type: 'jsonb', default: {} }) raw: Record<string, unknown>;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt: Date | null;
  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true }) syncedAt: Date | null;
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn() id: number;
  // ---- Access fields ----
  @Index({ unique: true }) @Column({ name: 'external_id', type: 'int' }) externalId: number; // КодТовара
  @Index() @Column({ type: 'text', nullable: true }) barcode: string | null; // ШтрихКод
  @Index() @Column({ name: 'category_external_id', type: 'int', nullable: true }) categoryExternalId: number | null; // КодТипа
  @Column({ type: 'text', default: '' }) name: string; // Марка
  @Column({ type: 'text', nullable: true }) brand: string | null; // Производитель
  @Column({ type: 'text', nullable: true }) unit: string | null; // ЕдиницаИзмерения
  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: numeric }) price: number | null; // Цена
  @Column({ name: 'currency_external_id', type: 'int', nullable: true }) currencyExternalId: number | null; // КодВалюты
  @Column({ type: 'numeric', precision: 14, scale: 3, default: 0, transformer: numeric }) quantity: number; // ОстатокНВС
  @Column({ name: 'in_price_list', type: 'boolean', default: false }) inPriceList: boolean; // Прайс-Лист
  @Column({ type: 'boolean', default: false }) discontinued: boolean; // ПоставкиПрекращены
  @Column({ type: 'text', nullable: true }) note: string | null; // Примечание
  @Column({ type: 'double precision', nullable: true }) weight: number | null; // Вес
  @Column({ type: 'double precision', nullable: true }) volume: number | null; // Объем
  @Column({ type: 'jsonb', default: {} }) raw: Record<string, unknown>;
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true }) deletedAt: Date | null;
  @Column({ name: 'synced_at', type: 'timestamptz', nullable: true }) syncedAt: Date | null;
  // ---- Web fields (CMS, step 8) ----
  @Index({ unique: true }) @Column({ type: 'text', nullable: true }) slug: string | null;
  @Column({ name: 'web_description', type: 'text', nullable: true }) webDescription: string | null;
  @Column({ type: 'jsonb', default: [] }) images: string[];
  @Column({ name: 'is_visible', type: 'boolean', default: true }) isVisible: boolean;
  @Column({ name: 'seo_title', type: 'text', nullable: true }) seoTitle: string | null;
  @Column({ name: 'seo_description', type: 'text', nullable: true }) seoDescription: string | null;
  /** { desc, title, meta: { hy, ru, en } } — description, SEO title, meta description per language (product-web.ts) */
  @Column({ type: 'jsonb', default: {} }) web: Record<string, Record<string, string>>;
  @Column({ name: 'old_price', type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: numeric }) oldPrice: number | null; // ֏
  /** admin corrections of the parsed specs: { key: value | '' (hide) } */
  @Column({ name: 'spec_edit', type: 'jsonb', default: {} }) specEdit: Record<string, string>;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

@Entity('sync_log')
export class SyncLog {
  @PrimaryGeneratedColumn() id: number;
  @Index() @CreateDateColumn({ name: 'received_at', type: 'timestamptz' }) receivedAt: Date;
  @Column({ type: 'text' }) entity: string;
  @Column({ name: 'batch_id', type: 'text', nullable: true }) batchId: string | null;
  @Column({ type: 'int', default: 0 }) upserts: number;
  @Column({ type: 'int', default: 0 }) deletes: number;
  @Column({ name: 'agent_version', type: 'text', nullable: true }) agentVersion: string | null;
  @Column({ type: 'text', nullable: true }) error: string | null;
}

@Entity('change_log')
export class ChangeLog {
  @PrimaryGeneratedColumn({ type: 'bigint' }) id: string;
  @CreateDateColumn({ type: 'timestamptz' }) at: Date;
  @Column({ type: 'text' }) entity: string;
  @Column({ type: 'text' }) action: string; // created | updated | restored | deleted
  @Column({ name: 'external_id', type: 'int', nullable: true }) externalId: number | null;
  @Column({ name: 'row_key', type: 'text', nullable: true }) rowKey: string | null; // Access tables mirror: row key
  @Column({ type: 'text', nullable: true }) name: string | null;
  @Column({ type: 'jsonb', default: {} }) changes: Record<string, [unknown, unknown]>;
}

@Entity('admin_users')
export class AdminUser {
  @PrimaryGeneratedColumn() id: number;
  @Index({ unique: true }) @Column({ type: 'text' }) email: string;
  @Column({ name: 'password_hash', type: 'text' }) passwordHash: string;
  @Column({ type: 'text', default: 'admin' }) role: 'admin' | 'manager';
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

export const ENTITIES = [Category, Currency, Product, SyncLog, ChangeLog, AdminUser];
