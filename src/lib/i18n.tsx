import { createContext, useContext } from "react";
import type { Language } from "./courses";

/** Langue courante du site, fournie par App ; les pages choisissent leur dictionnaire avec useT(). */
export const LanguageContext = createContext<Language>("fr");
export const useLanguage = (): Language => useContext(LanguageContext);
export function useT<T>(dictionary: Record<Language, T>): T { return dictionary[useLanguage()]; }
export const dateLocale: Record<Language, string> = { fr: "fr-FR", en: "en-GB", pt: "pt-PT", es: "es-ES" };
