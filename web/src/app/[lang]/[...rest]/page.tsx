import { notFound } from 'next/navigation';

/** Any unknown path inside a language → our 404 page (with header/footer), not Next's bare one. */
export default function Rest() {
  notFound();
}
