import type { CatNode } from '@/lib/api';
import { SPRITE } from './icon-symbols';

/**
 * The icon sprite, once per page. Section icons added in the admin come with /api/shop/categories as `g` = [viewBox, svg];
 * the server rebuilds that SVG from a whitelist (backend/src/site-icons.ts), so it is safe to inline.
 */
export function Sprite({ cats }: { cats: CatNode[] }) {
  const extra = cats
    .filter((c) => c.i && c.g && /^[\w-]+$/.test(c.i) && !SPRITE.includes(`id="${c.i}"`))
    .map((c) => `<symbol id="${c.i}" viewBox="${c.g![0].replace(/[^\d.\s-]/g, '')}">${c.g![1]}</symbol>`)
    .join('');
  return <svg id="ledIcons" width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: SPRITE + extra }} />;
}
