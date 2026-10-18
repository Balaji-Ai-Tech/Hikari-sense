import { useSyncExternalStore } from "react";
import { DEFAULT_LANG, LANGUAGES, type Lang } from "./config";
import { EN, TRANSLATIONS, type TKey } from "./translations";

const KEY = "hs-lang";
let current: Lang | null = null;
const subs = new Set<() => void>();
function read(): Lang {
  if (current) return current;
  const v = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
  current = LANGUAGES.some((l) => l.code === v) ? (v as Lang) : DEFAULT_LANG;
  return current;
}
export function setLang(l: Lang) {
  current = l;
  window.localStorage.setItem(KEY, l);
  document.documentElement.lang = l;
  subs.forEach((f) => f());
}
export function useLang(): Lang {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    read,
    () => DEFAULT_LANG,
  );
}
export function translate(lang: Lang, key: TKey, vars?: Record<string, string | number>) {
  let s: string = TRANSLATIONS[lang][key] ?? EN[key];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
export function useT() {
  const lang = useLang();
  return (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars);
}
export function hasKey(k: string): k is TKey {
  return k in EN;
}
export { LANGUAGES, type Lang, type TKey };
