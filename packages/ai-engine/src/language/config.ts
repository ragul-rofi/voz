// File: packages/ai-engine/src/language/config.ts

export type SupportedLanguage = "en" | "ta";

export interface LanguageConfig {
  sttLang: SupportedLanguage;
  ttsVoiceId: string | null;
  ttsEnabled: boolean;
}

export const LANGUAGE_CONFIG: Record<SupportedLanguage, LanguageConfig> = {
  en: {
    sttLang: "en",
    ttsVoiceId: "af_sarah",
    ttsEnabled: true,
  },
  ta: {
    sttLang: "ta",
    ttsVoiceId: null,
    ttsEnabled: false,
  },
};
