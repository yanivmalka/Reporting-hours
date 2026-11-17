import { useEffect, useState } from 'react';
import { KEYS } from '../lib/keys';
import { onLocalWrite } from '../lib/storage';
import { loadSessionNotes, type SessionNote } from '../lib/sessionNotes';

/**
 * פרטי המפגשים (lib/sessionNotes.ts) לתצוגה — טעינה אחת לכל המופעים, ורענון
 * בכל כתיבה מקומית שלהם. לאייקונים ביומן ולשורת הפרטים באשף הדיווח.
 */
let cache: SessionNote[] = [];
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function refresh() {
  loading = loadSessionNotes().then((list) => {
    cache = list;
    for (const l of listeners) l();
  });
  return loading;
}

onLocalWrite((key) => {
  if (key === KEYS.sessionNotes) void refresh();
});

export function useSessionNotes(): SessionNote[] {
  const [list, setList] = useState(cache);
  useEffect(() => {
    const l = () => setList(cache);
    listeners.add(l);
    if (!loading) void refresh();
    else setList(cache);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return list;
}
