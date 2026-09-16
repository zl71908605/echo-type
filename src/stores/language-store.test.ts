import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_INTERFACE_LANGUAGE, useLanguageStore } from './language-store';

const storage = new Map<string, string>();

const localStorageMock: Storage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, value);
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => storage.clear(),
  get length() {
    return storage.size;
  },
  key: (index: number) => [...storage.keys()][index] ?? null,
};

vi.stubGlobal('localStorage', localStorageMock);
vi.stubGlobal('window', globalThis);

describe('language-store', () => {
  beforeEach(() => {
    storage.clear();
    useLanguageStore.setState({
      interfaceLanguage: DEFAULT_INTERFACE_LANGUAGE,
      hasExplicitPreference: false,
      initialized: false,
    });
  });

  it('defaults to chinese on a fresh visit', () => {
    useLanguageStore.getState().initialize();

    expect(useLanguageStore.getState()).toMatchObject({
      interfaceLanguage: 'zh',
      hasExplicitPreference: false,
      initialized: true,
    });
  });

  it('does not restore a stored value the user never chose explicitly', () => {
    // 旧版本会把浏览器检测结果写进 storage（hasExplicitPreference 为 false），
    // 那不算用户的选择，不应覆盖默认语言。
    storage.set(
      'echotype_language_settings',
      JSON.stringify({
        interfaceLanguage: 'en',
        hasExplicitPreference: false,
      }),
    );

    useLanguageStore.getState().initialize();

    expect(useLanguageStore.getState()).toMatchObject({
      interfaceLanguage: 'zh',
      hasExplicitPreference: false,
      initialized: true,
    });
  });

  it('persists explicit user choice', () => {
    useLanguageStore.getState().setInterfaceLanguage('en');

    expect(useLanguageStore.getState()).toMatchObject({
      interfaceLanguage: 'en',
      hasExplicitPreference: true,
      initialized: true,
    });
    expect(JSON.parse(storage.get('echotype_language_settings') ?? '{}')).toEqual({
      interfaceLanguage: 'en',
      hasExplicitPreference: true,
    });
  });

  it('uses the stored explicit preference over the default', () => {
    storage.set(
      'echotype_language_settings',
      JSON.stringify({
        interfaceLanguage: 'en',
        hasExplicitPreference: true,
      }),
    );

    useLanguageStore.getState().initialize();

    expect(useLanguageStore.getState()).toMatchObject({
      interfaceLanguage: 'en',
      hasExplicitPreference: true,
      initialized: true,
    });
  });

  it('ignores malformed storage and falls back to the default language', () => {
    storage.set('echotype_language_settings', '{bad json');

    useLanguageStore.getState().initialize();

    expect(useLanguageStore.getState()).toMatchObject({
      interfaceLanguage: 'zh',
      hasExplicitPreference: false,
      initialized: true,
    });
  });
});
