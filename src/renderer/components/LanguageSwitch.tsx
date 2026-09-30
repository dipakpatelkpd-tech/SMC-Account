import type { JSX } from "react";
import { LANGUAGES, useLanguage, useStrings, type Language } from "../i18n/index.js";

/**
 * The Gujarati / English buttons, for the screens that come before the books -
 * login, the school list, a new school. Someone who cannot read Gujarati has to
 * be able to get past them to reach the setting.
 */
export function LanguageSwitch(): JSX.Element {
  const t = useStrings();
  const { language, setLanguage } = useLanguage();
  return (
    <div className="setup-language">
      {LANGUAGES.map((option) => (
        <button
          key={option}
          type="button"
          className={language === option ? "primary" : "ghost"}
          aria-pressed={language === option}
          onClick={() => setLanguage(option as Language)}
        >
          {option === "gu" ? t.languageGujarati : t.languageEnglish}
        </button>
      ))}
    </div>
  );
}
