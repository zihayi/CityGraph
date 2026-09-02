import enUS from "./en-US";
import zhCN from "./zh-CN";

export type Locale = "zh-CN" | "en-US";
export type TranslationKey = keyof typeof enUS;

const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  "en-US": enUS,
  "zh-CN": zhCN,
};

export const localeLabels: Record<Locale, string> = {
  "zh-CN": "中文",
  "en-US": "English",
};

export function translate(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  let value = dictionaries[locale][key] ?? enUS[key];
  if (params) {
    for (const [name, replacement] of Object.entries(params)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
  }
  return value;
}

export function getInitialLocale(): Locale {
  const saved = localStorage.getItem("citygraph:locale");
  if (saved === "zh-CN" || saved === "en-US") return saved;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US";
}
