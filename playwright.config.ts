import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_EXISTING_SERVER !== 'false';

// 产品默认界面语言是中文（见 src/stores/language-store.ts 的
// DEFAULT_INTERFACE_LANGUAGE），而绝大多数 e2e 断言写的是英文文案。
// 这里在 context 级别预置一个"用户已显式选择英文"的偏好，让那些断言保持有效；
// 专门测试语言的 e2e/i18n.spec.ts 会自行清除这个键来验证默认中文。
const pinnedEnglishStorage = {
  cookies: [],
  origins: [
    {
      origin: new URL(baseURL).origin,
      localStorage: [
        {
          name: 'echotype_language_settings',
          value: JSON.stringify({ interfaceLanguage: 'en', hasExplicitPreference: true }),
        },
      ],
    },
  ],
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    storageState: pinnedEnglishStorage,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: process.env.CI ? false : reuseExistingServer,
    timeout: 30000,
  },
});
