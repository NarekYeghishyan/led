/** Brand logo of the templates (components/home/art.ts BRAND_LOGOS) or the name as a word mark. */
import { BRAND_LOGOS } from '../home/art';

export function BrandLogo({ name }: { name: string }) {
  const g = BRAND_LOGOS[name.toLowerCase()];
  return g
    ? <span className="br-lg" style={{ ['--bc' as string]: g[0] }} dangerouslySetInnerHTML={{ __html: g[1] }} />
    : <span className="br-lg br-wm" style={{ ['--bc' as string]: '#1468DC' }}>{name}</span>;
}
