/** Icon from the page sprite (icon-symbols.ts + icons added in the admin). */
export function Icon({ name, className = 'i', style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return <svg className={className} style={style} aria-hidden="true"><use href={`#${name}`} /></svg>;
}
