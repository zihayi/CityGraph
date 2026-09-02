import { translate, type TranslationKey } from "../i18n";
import { useEditorStore } from "./store/editorStore";

export function useTranslation(): (key: TranslationKey, params?: Record<string, string | number>) => string {
  const locale = useEditorStore((state) => state.locale);
  return (key, params) => translate(locale, key, params);
}
