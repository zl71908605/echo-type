# Supabase 配置指南

本指南帮助你配置 Supabase 以启用 StepUp 的登录认证和云同步功能。

> **注意:** Supabase 配置完全可选。未配置时 app 完全离线运行，数据存储在本地 IndexedDB。

---

## 第 1 步：创建 Supabase 项目

1. 访问 [supabase.com/dashboard](https://supabase.com/dashboard)
2. 点击 **New Project**
3. 填写信息：
   - **Project name:** `echotype`
   - **Database password:** 生成强密码并保存
   - **Region:** 选择最近的区域（推荐 Northeast Asia / Tokyo）
4. 等待项目创建完成（约 1-2 分钟）

---

## 第 2 步：获取 API 密钥

1. 进入项目 Dashboard → **Settings** → **API**
2. 记录以下值：
   - **Project URL:** `https://xxx.supabase.co`
   - **anon public key:** `eyJ...`（公开密钥，可以暴露到前端）

---

## 第 3 步：配置环境变量

在项目根目录创建 `.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

重启开发服务器：
```bash
# 先停止当前服务器，然后重新启动
pnpm dev
```

---

## 第 4 步：配置 OAuth 登录

### Google OAuth

1. 访问 [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. 创建 **OAuth 2.0 Client ID**（Web application 类型）
3. **Authorized redirect URIs** 添加：
   ```
   https://your-project.supabase.co/auth/v1/callback
   ```
4. 在 Supabase Dashboard → **Authentication** → **Providers** → **Google**：
   - 开启 Google provider
   - 填入 Client ID 和 Client Secret

### GitHub OAuth

1. 访问 [GitHub Developer Settings](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**
2. 填写：
   - **Application name:** `StepUp`
   - **Homepage URL:** `http://localhost:3000`（或你的域名）
   - **Authorization callback URL:**
     ```
     https://your-project.supabase.co/auth/v1/callback
     ```
3. 在 Supabase Dashboard → **Authentication** → **Providers** → **GitHub**：
   - 开启 GitHub provider
   - 填入 Client ID 和 Client Secret

---

## 第 5 步：创建数据库表

在 Supabase Dashboard → **SQL Editor** 中运行以下 SQL：

```sql
-- ============================================
-- StepUp Cloud Sync Tables
-- ============================================

-- 用户 Profile（扩展 auth.users）
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  cefr_level TEXT CHECK (cefr_level IN ('A1','A2','B1','B2','C1','C2')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 注册时自动创建 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'User'),
    COALESCE(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 内容库
CREATE TABLE public.contents (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  source TEXT,
  difficulty TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 学习记录
CREATE TABLE public.records (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id TEXT NOT NULL,
  module TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  accuracy REAL DEFAULT 0,
  wpm REAL,
  last_practiced TIMESTAMPTZ,
  next_review TIMESTAMPTZ,
  fsrs_card JSONB,
  mistakes JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 练习会话
CREATE TABLE public.sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_id TEXT NOT NULL,
  module TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  total_chars INTEGER DEFAULT 0,
  correct_chars INTEGER DEFAULT 0,
  wrong_chars INTEGER DEFAULT 0,
  total_words INTEGER DEFAULT 0,
  wpm REAL DEFAULT 0,
  accuracy REAL DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- 索引
-- ============================================
CREATE INDEX idx_contents_user ON public.contents(user_id);
CREATE INDEX idx_contents_updated ON public.contents(updated_at);
CREATE INDEX idx_records_user ON public.records(user_id);
CREATE INDEX idx_records_updated ON public.records(updated_at);
CREATE INDEX idx_sessions_user ON public.sessions(user_id);
CREATE INDEX idx_sessions_updated ON public.sessions(updated_at);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Contents
CREATE POLICY "Users own their contents"
  ON public.contents FOR ALL USING (auth.uid() = user_id);

-- Records
CREATE POLICY "Users own their records"
  ON public.records FOR ALL USING (auth.uid() = user_id);

-- Sessions
CREATE POLICY "Users own their sessions"
  ON public.sessions FOR ALL USING (auth.uid() = user_id);

-- ============================================
-- 自动更新 updated_at 触发器
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contents_updated_at
  BEFORE UPDATE ON public.contents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_records_updated_at
  BEFORE UPDATE ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
```

---

## 第 6 步：配置手机号登录

账号登录使用 **手机号 + 短信验证码**，不需要写额外的应用代码，但必须在 Dashboard 里接通短信通道：

1. **Authentication → Providers → Phone**：启用 Phone provider。
2. **Authentication → Providers → Phone → SMS Provider**：选择并填写 Twilio / MessageBird / Vonage / Textlocal 的凭据。
   > Supabase 内置只支持这四家。若要接阿里云 / 腾讯云等国内短信服务，需要在
   > **Authentication → Hooks → Send SMS Hook** 里指向一个自建的 HTTP 端点。
   > 在短信通道接通之前，登录页会正常展示，但点击「获取验证码」会返回错误提示。
3. 如果开启了 **Attack Protection** 的 CAPTCHA，注意它对 phone 同样生效，`signInWithOtp` 会因缺少 captcha token 被拒绝。

登录页固定使用中国大陆国家码 `+86`（见 `src/lib/phone.ts`）。需要支持其他地区时，
把 `PHONE_COUNTRY_CODE` 换成国家码选择器，并让 `isValidPhone` 按国家码分支即可。

## 第 7 步：验证

1. 重启开发服务器后，侧边栏底部应显示 **登录** 按钮（而非 "v1.0 · Local"）
2. 点击登录 → 输入手机号 → 获取验证码 → 填写短信中的 6 位验证码
3. 登录成功后：
   - 侧边栏显示你的手机号
   - Settings → Account 显示手机号和同步开关
   - 开启同步后数据每 30 秒自动增量同步

---

## 生产部署

### Vercel 部署

在 Vercel 项目设置中添加环境变量：
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 短信通道

数据库之外还有一处生产配置：**Authentication → Providers → Phone → SMS Provider**
需要填写可用的短信服务商凭据，否则线上环境无法发送验证码。

手机号登录是纯应用内流程，不需要配置任何 OAuth Redirect URL。

> 项目里保留的 `/api/auth/callback` 与 `/api/auth/token` 属于 **AI 提供商** OAuth
> （见 `src/lib/oauth.ts`），与账号登录无关。

---

## 开发环境登录

短信通道接通前，或在完全没有配置 Supabase 的本机上，可以用开发环境登录进入 Dashboard：

```env
# .env.development.local —— 注意不要写进 .env.local
NEXT_PUBLIC_ENABLE_DEV_LOGIN=true
```

**为什么必须是 `.env.development.local`**：Next.js 的加载顺序是 `process.env` →
`.env.$(NODE_ENV).local` → `.env.local` → `.env.$(NODE_ENV)` → `.env`。`next build` 不会读
`.env.development.local`，但**会读 `.env.local`**——开关写进 `.env.local` 会让本地生产构建
也带上开发登录。

改动开关后**必须重启 `pnpm dev`**：`NEXT_PUBLIC_*` 是构建期内联的，不会热更新。

开启后：

- 登录页出现琥珀色的「开发环境登录」区块，固定手机号 `13800138000`、固定验证码 `123456`，
  点「填入开发账号」自动填好（见 `src/lib/dev-login.ts`）。
- 该号码**不走 Supabase、不发短信**，直接建立一个本地会话，因此没有配置 Supabase 也能用。
- 其他手机号仍走真实短信流程。

### 需要知道的行为

| 行为 | 说明 |
|------|------|
| 独立数据库 | 开发会话切到 `echotype:user:dev-local-user`，是**独立的空库**，看不到匿名库的学习进度。首次登录会新建并播种，略有耗时。 |
| 登出方式 | 侧边栏头像 → 退出登录。开发会话下会一并清掉可能存在的真实 Supabase 会话，保证登出后状态确定。 |
| 云同步 | 开发会话期间同步被强制停用（`sync-store.ts` 的 `getCurrentUserId` 会直接返回 null），不会把真实账号的数据拉进开发库。 |
| 不要用真实号码 | `DEV_LOGIN_PHONE` 若改成正在使用的真实号码，该号码在开发环境将永远收不到真实短信。 |
| 生产安全 | 开关未设置时，固定号码会正常走真实路径；生产构建里该常量为 false，运行时无法篡改。 |

---

## 故障排查

| 问题 | 解决方案 |
|------|---------|
| 页面报 "Your project's URL and Key are required" | 检查 `.env.local` 是否正确配置并重启 dev server |
| 点击「获取验证码」报 "Phone signups are disabled" | 在 Supabase Dashboard → Authentication → Providers 中启用 Phone provider |
| 点击「获取验证码」报 "Error sending sms" | SMS Provider 凭据未配置或无效，检查 Authentication → Providers → Phone |
| 收不到验证码 | 确认是有效的 11 位大陆号码（`1[3-9]` 开头），并确认短信通道已接通 |
| 开发环境登录区块不出现 | 确认开关在 `.env.development.local` 且值为 `true`，然后**重启** dev server（`NEXT_PUBLIC_*` 是构建期内联的） |
| 同步失败 "Not authenticated" | 确认已登录，检查 Supabase session 是否过期 |
| 数据未同步 | 检查 Settings → Account 中同步是否已启用 |
| RLS 错误 | 确认 SQL 中的 RLS policies 已正确创建 |

---

## Supabase 免费额度

Supabase 免费计划包含：
- **数据库:** 500MB
- **Auth:** 50,000 月活用户
- **存储:** 1GB
- **带宽:** 2GB/月

对于个人英语学习应用完全够用。
