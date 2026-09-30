/**
 * Language selection for the interface.
 *
 * The choice is kept in localStorage rather than in the database on purpose: it
 * is a preference belonging to whoever is sitting at this machine, not a fact
 * about the school's accounts. Nothing in the books changes when it is switched,
 * and the accounting tables stay free of interface concerns.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { JSX, ReactNode } from "react";
import { en, gu, type Strings } from "./strings.js";

export const LANGUAGES = ["gu", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

const DICTIONARIES: Record<Language, Strings> = { gu, en };
const STORAGE_KEY = "smc.language";

/** Gujarati is the default: it is the language the school actually works in. */
const DEFAULT_LANGUAGE: Language = "gu";

function readStoredLanguage(): Language {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.includes(stored as Language) ? (stored as Language) : DEFAULT_LANGUAGE;
  } catch {
    // Private mode, blocked storage, or a stripped-down environment.
    return DEFAULT_LANGUAGE;
  }
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: Strings;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }): JSX.Element {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not being able to remember the choice is not a reason to refuse it.
    }
  }, []);

  // Keep the document language honest for the sake of font fallback and
  // anything that reads it, such as a screen reader.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, t: DICTIONARIES[language] }),
    [language, setLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

function useLanguageContext(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useStrings must be used inside a LanguageProvider");
  return context;
}

/** The current dictionary. Screens read labels off this. */
export function useStrings(): Strings {
  return useLanguageContext().t;
}

/** The current language and a setter, for the settings screen. */
export function useLanguage(): { language: Language; setLanguage: (language: Language) => void } {
  const { language, setLanguage } = useLanguageContext();
  return { language, setLanguage };
}

/**
 * Pick the right half of a bilingual pair coming from the engine.
 *
 * Validation issues carry both a Gujarati and an English message, so this is how
 * a screen chooses without knowing which language is active.
 */
export function useBilingual(): (pair: { gu: string; en: string }) => string {
  const { language } = useLanguageContext();
  return useCallback((pair) => (language === "en" ? pair.en : pair.gu), [language]);
}

export type { Strings };
