/**
 * Tells the Next.js storefront (web/, container `web`) to refresh its cached pages now instead of waiting for the
 * 60 s cache: after a sync batch changed products, or the site catalog changed in the admin.
 * Env: WEB_ORIGIN (http://web:3000 in compose), REVALIDATE_SECRET (same value in the web service). Missing = no-op.
 * Fire-and-forget, coalesced: many calls within 3 s send one request.
 */
import { Logger } from '@nestjs/common';

const log = new Logger('revalidate');
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function revalidateSite(tags: string[]) {
  const origin = process.env.WEB_ORIGIN, secret = process.env.REVALIDATE_SECRET;
  if (!origin || !secret) return;
  tags.forEach((t) => pending.add(t));
  if (timer) return;
  timer = setTimeout(async () => {
    const send = [...pending];
    pending = new Set();
    timer = null;
    try {
      const r = await fetch(`${origin}/internal/revalidate`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
        body: JSON.stringify({ tags: send }), signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) log.warn(`storefront refresh ${send.join(',')}: HTTP ${r.status}`);
    } catch (e) {
      log.warn(`storefront refresh ${send.join(',')}: ${(e as Error).message}`);
    }
  }, 3000);
}
