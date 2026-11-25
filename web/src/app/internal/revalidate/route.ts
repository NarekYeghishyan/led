import { revalidateTag } from 'next/cache';

/**
 * POST /internal/revalidate {tags: ['products','categories']} with header x-revalidate-secret — called by the NestJS API
 * (backend/src/revalidate.ts) after a sync batch or a catalog change, over the compose network. nginx answers 404 for
 * /internal/ from outside; the secret is the second lock.
 */
const ALLOWED = new Set(['products', 'categories', 'blocks']);

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get('x-revalidate-secret') !== secret) return new Response('forbidden', { status: 403 });
  let tags: string[] = [];
  try { tags = ((await req.json()) as { tags?: string[] }).tags ?? []; } catch { /* empty body */ }
  const done = tags.filter((t) => ALLOWED.has(t));
  for (const t of done) revalidateTag(t, { expire: 0 });
  return Response.json({ ok: true, revalidated: done });
}
