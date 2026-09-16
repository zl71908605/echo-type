import { create } from 'zustand';

const STORAGE_KEY = 'echotype_language_settings';

export type InterfaceLanguage = 'en' | 'zh';

/**
 * 首次访问时的默认界面语言。
 *
 * 此前按 `navigator.language` 自动判定，但产品面向中文用户，自动判定会让
 * 浏览器语言非中文的访问者（以及无法取到 `navigator` 的场景）落到英文界面。
 * 现改为固定默认中文；用户在设置里的显式选择始终优先于这个默认值。
 */
export const DEFAULT_INTERFACE_LANGUAGE: InterfaceLanguage = 'zh';

interface LanguageSettings {
  interfaceLanguage: InterfaceLanguage;
  hasExplicitPreference: boolean;
}

interface LanguageStore extends LanguageSettings {
  setInterfaceLanguage: (lang: InterfaceLanguage) => void;
  initialized: boolean;
  initialize: () => void;
  hydrate: () => void;
}

function isInterfaceLanguage(value: unknown): value is InterfaceLanguage {
  return value === 'en' || value === 'zh';
}

function loadSettings(): Partial<LanguageSettings> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<LanguageSettings>;
    if (!isInterfaceLanguage(parsed.interfaceLanguage)) return {};

    return {
      interfaceLanguage: parsed.interfaceLanguage,
      hasExplicitPreference: parsed.hasExplicitPreference === true,
    };
  } catch {
    return {};
  }
}

function saveSettings(settings: LanguageSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}

export const useLanguageStore = create<LanguageStore>((set) => ({
  interfaceLanguage: DEFAULT_INTERFACE_LANGUAGE,
  hasExplicitPreference: false,
  initialized: false,

  setInterfaceLanguage: (interfaceLanguage) => {
    set({ interfaceLanguage, hasExplicitPreference: true, initialized: true });
    saveSettings({ interfaceLanguage, hasExplicitPreference: true });
  },

  initialize: () => {
    const saved = loadSettings();

    // 只有用户主动选过的语言才覆盖默认值——旧版本写入的自动检测结果
    // （hasExplicitPreference 为 false）不再算数。
    if (saved.interfaceLanguage && saved.hasExplicitPreference) {
      set({
        interfaceLanguage: saved.interfaceLanguage,
        hasExplicitPreference: true,
        initialized: true,
      });
      return;
    }

    set({
      interfaceLanguage: DEFAULT_INTERFACE_LANGUAGE,
      hasExplicitPreference: false,
      initialized: true,
    });
  },

  hydrate: () => {
    useLanguageStore.getState().initialize();
  },
}));
