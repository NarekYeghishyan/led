'use client';
import { useEffect } from 'react';
import { rememberSearch } from './SearchBox';

/** Puts the query of the search page into the header's recent searches (also when the page was opened from a link). */
export function SearchRemember({ q }: { q: string }) {
  useEffect(() => { rememberSearch(q); }, [q]);
  return null;
}
