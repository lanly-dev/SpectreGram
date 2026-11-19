// Interface i18n. English is the source language and the default; every other
// language supplies the same keys in its own table, so a missing entry falls
// back to English instead of breaking the UI.
//
// Two consumers:
//  - `t(key, vars)` for strings the renderer builds (toasts, verdicts, labels);
//  - `translateDom()` for the static markup, which matches text/attributes
//    against the English table and swaps them in place (originals are kept, so
//    switching back to English restores the exact source).
//
// Session-only, like the palette: nothing is written to disk.

import { EN, type I18nKey } from './en';
import { ES } from './es';
import { FR } from './fr';
import { ZH } from './zh';
import { HI } from './hi';
import { VI } from './vi';
import { KO } from './ko';
import { RU } from './ru';
import { JA } from './ja';
import { AR } from './ar';
import { DE } from './de';
import { HALLOWEEN } from './halloween';

export type Lang = 'en' | 'es' | 'fr' | 'zh' | 'hi' | 'vi' | 'ko' | 'ru' | 'ja' | 'ar' | 'de' | 'halloween';

export const LANGUAGES: ReadonlyArray<{ code: Lang; native: string; english: string }> = [
  { code: 'en', native: 'English', english: 'English' },
  { code: 'es', native: 'Español', english: 'Spanish' },
  { code: 'fr', native: 'Français', english: 'French' },
  { code: 'zh', native: '中文', english: 'Chinese' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi' },
  { code: 'vi', native: 'Tiếng Việt', english: 'Vietnamese' },
  { code: 'ko', native: '한국어', english: 'Korean' },
  { code: 'ru', native: 'Русский', english: 'Russian' },
  { code: 'ja', native: '日本語', english: 'Japanese' },
  { code: 'ar', native: 'العربية', english: 'Arabic' },
  { code: 'de', native: 'Deutsch', english: 'German' },
  { code: 'halloween', native: 'Halloween', english: 'Spooky English' },
];

const TABLES: Record<Exclude<Lang, 'en'>, Partial<Record<I18nKey, string>>> = {
  es: ES,
  fr: FR,
  zh: ZH,
  hi: HI,
  vi: VI,
  ko: KO,
  ru: RU,
  ja: JA,
  ar: AR,
  de: DE,
  halloween: HALLOWEEN,
};

let current: Lang = 'en';

export function getLanguage(): Lang {
  return current;
}

export function languageName(code: Lang): string {
  return LANGUAGES.find((l) => l.code === code)?.native ?? 'English';
}

function fill(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m,
  );
}

/** Translate one table key. Unknown keys fall back to the key itself. */
export function t(key: I18nKey, vars?: Record<string, string | number>): string {
  const source = EN[key];
  const table = current === 'en' ? null : TABLES[current];
  const text = (table && table[key]) || source;
  return fill(text, vars);
}

// English text -> key, for the static-markup pass.
const BY_SOURCE = new Map<string, I18nKey>(
  (Object.keys(EN) as I18nKey[]).map((key) => [EN[key], key]),
);

const originalText = new WeakMap<Text, string>();
const originalAttr = new WeakMap<Element, Map<string, string>>();

const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'] as const;

function translateTextNode(node: Text): void {
  const parent = node.parentElement;
  if (!parent) return;
  const tag = parent.tagName;
  if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CANVAS' || tag === 'TEXTAREA') return;
  let source = originalText.get(node);
  if (source === undefined) {
    source = node.data;
    if (!BY_SOURCE.has(source.trim())) return; // not a source string; leave it be
    originalText.set(node, source);
  }
  const text = source.trim();
  if (!text) return;
  const key = BY_SOURCE.get(text);
  if (!key) return;
  const start = source.indexOf(text);
  // Always rebuild from the saved English source, so switching back restores it.
  const replacement = current === 'en' ? text : t(key);
  node.data = source.slice(0, start) + replacement + source.slice(start + text.length);
}

function translateAttrs(el: Element): void {
  for (const attr of ATTRS) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    let saved = originalAttr.get(el);
    if (!saved) {
      saved = new Map();
      originalAttr.set(el, saved);
    }
    if (!saved.has(attr)) {
      if (!BY_SOURCE.has(value.trim())) continue;
      saved.set(attr, value);
    }
    const source = saved.get(attr)!;
    const key = BY_SOURCE.get(source.trim());
    if (!key) continue;
    el.setAttribute(attr, current === 'en' ? source : t(key));
  }
}

/** Re-translate the static markup (call once per language change). */
export function translateDom(root: ParentNode = document.body): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    translateTextNode(node as Text);
    node = walker.nextNode();
  }
  const elements = (root as ParentNode).querySelectorAll?.('*') ?? [];
  elements.forEach((el) => translateAttrs(el));
  if (root instanceof Element) translateAttrs(root);
}

/**
 * Switch the interface language. Sets `<html lang>` (Halloween reads as
 * English) and re-translates the static markup; the caller re-renders any
 * text it built itself (toasts, verdict, panel summaries).
 */
export function setLanguage(code: Lang): void {
  current = code;
  document.documentElement.lang = code === 'halloween' ? 'en' : code;
  document.documentElement.dataset.language = code;
  translateDom();
}
