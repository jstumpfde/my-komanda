import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { platformSettings, type MessageDefaults, type DripTemplates } from "@/lib/db/schema"
import {
  DEFAULT_INVITE_MESSAGE,
  DEFAULT_OFF_HOURS_MESSAGE,
  DEFAULT_REJECT_MESSAGE,
  DEFAULT_FIRST_MESSAGE_DELAY_SECONDS,
} from "@/lib/hh/default-messages"
import { DRIP_TEMPLATES_SEED } from "@/lib/funnel-v2/dozhim-templates"

// Платформенные KV-настройки (таблица platform_settings, drizzle/0154).

export const TRASH_RETENTION_KEY = "trash_retention_days"
export const TRASH_RETENTION_DEFAULT = 7
// Допустимые значения для UI/валидации (как у корзины вакансий + 7).
export const TRASH_RETENTION_OPTIONS = [1, 3, 7, 14, 30, 60, 90] as const

export async function getPlatformSetting<T = unknown>(key: string): Promise<T | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1)
  return (row?.value as T) ?? null
}

export async function setPlatformSetting(key: string, value: unknown): Promise<void> {
  await db
    .insert(platformSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value, updatedAt: new Date() },
    })
}

// Срок авто-удаления единой Корзины (дни). Падение/отсутствие → дефолт.
export async function getTrashRetentionDays(): Promise<number> {
  try {
    const v = await getPlatformSetting<number>(TRASH_RETENTION_KEY)
    const n = typeof v === "number" ? v : Number(v)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : TRASH_RETENTION_DEFAULT
  } catch {
    return TRASH_RETENTION_DEFAULT
  }
}

// ─── Брендинг и SEO платформы ─────────────────────────────────────────────────

export const PLATFORM_TITLE_KEY = "platform_title"
export const PLATFORM_DESCRIPTION_KEY = "platform_description"
export const PLATFORM_OG_IMAGE_KEY = "platform_og_image"
export const FAVICON_URLS_KEY = "favicon_urls"
export const PUBLIC_SEO_DEFAULTS_KEY = "public_seo_defaults"

// Дефолты = текущие хардкод-значения (чтобы при пустой БД всё работало)
export const PLATFORM_TITLE_DEFAULT = "Company24 — HR Рекрутинговая платформа"
export const PLATFORM_DESCRIPTION_DEFAULT =
  "Современная платформа для управления процессом найма с AI-скорингом кандидатов"

export interface FaviconUrls {
  light: string   // /icon-light-32x32.png
  dark:  string   // /icon-dark-32x32.png
  svg:   string   // /icon.svg
  apple: string   // /apple-icon.png
}

export const FAVICON_URLS_DEFAULT: FaviconUrls = {
  light: "/icon-light-32x32.png",
  dark:  "/icon-dark-32x32.png",
  svg:   "/icon.svg",
  apple: "/apple-icon.png",
}

export interface PublicSeoDefaults {
  ogImage:               string | null
  careersTitleSuffix:    string  // e.g. "— Вакансии"
  vacancyTitleTemplate:  string  // e.g. "{title} — {company}"
}

export const PUBLIC_SEO_DEFAULTS_DEFAULT: PublicSeoDefaults = {
  ogImage:              null,
  careersTitleSuffix:   "— Вакансии",
  vacancyTitleTemplate: "{title} — {company}",
}

/** Заголовок платформы. Никогда не падает, всегда возвращает строку. */
export async function getPlatformTitle(): Promise<string> {
  try {
    const v = await getPlatformSetting<string>(PLATFORM_TITLE_KEY)
    return (typeof v === "string" && v.trim()) ? v.trim() : PLATFORM_TITLE_DEFAULT
  } catch {
    return PLATFORM_TITLE_DEFAULT
  }
}

/** Описание платформы. Никогда не падает. */
export async function getPlatformDescription(): Promise<string> {
  try {
    const v = await getPlatformSetting<string>(PLATFORM_DESCRIPTION_KEY)
    return (typeof v === "string" && v.trim()) ? v.trim() : PLATFORM_DESCRIPTION_DEFAULT
  } catch {
    return PLATFORM_DESCRIPTION_DEFAULT
  }
}

/** OG-картинка платформы (URL или null). Никогда не падает. */
export async function getPlatformOgImage(): Promise<string | null> {
  try {
    const v = await getPlatformSetting<string>(PLATFORM_OG_IMAGE_KEY)
    return (typeof v === "string" && v.trim()) ? v.trim() : null
  } catch {
    return null
  }
}

/** URLs иконок фавикона. Никогда не падает, фолбэк — дефолты. */
export async function getFaviconUrls(): Promise<FaviconUrls> {
  try {
    const v = await getPlatformSetting<Partial<FaviconUrls>>(FAVICON_URLS_KEY)
    if (!v || typeof v !== "object") return FAVICON_URLS_DEFAULT
    return {
      light: (v.light && typeof v.light === "string") ? v.light : FAVICON_URLS_DEFAULT.light,
      dark:  (v.dark  && typeof v.dark  === "string") ? v.dark  : FAVICON_URLS_DEFAULT.dark,
      svg:   (v.svg   && typeof v.svg   === "string") ? v.svg   : FAVICON_URLS_DEFAULT.svg,
      apple: (v.apple && typeof v.apple === "string") ? v.apple : FAVICON_URLS_DEFAULT.apple,
    }
  } catch {
    return FAVICON_URLS_DEFAULT
  }
}

/** SEO-дефолты публичных страниц. Никогда не падает. */
export async function getPublicSeoDefaults(): Promise<PublicSeoDefaults> {
  try {
    const v = await getPlatformSetting<Partial<PublicSeoDefaults>>(PUBLIC_SEO_DEFAULTS_KEY)
    if (!v || typeof v !== "object") return PUBLIC_SEO_DEFAULTS_DEFAULT
    return {
      ogImage: typeof v.ogImage === "string" ? v.ogImage : PUBLIC_SEO_DEFAULTS_DEFAULT.ogImage,
      careersTitleSuffix: (typeof v.careersTitleSuffix === "string" && v.careersTitleSuffix.trim())
        ? v.careersTitleSuffix
        : PUBLIC_SEO_DEFAULTS_DEFAULT.careersTitleSuffix,
      vacancyTitleTemplate: (typeof v.vacancyTitleTemplate === "string" && v.vacancyTitleTemplate.trim())
        ? v.vacancyTitleTemplate
        : PUBLIC_SEO_DEFAULTS_DEFAULT.vacancyTitleTemplate,
    }
  } catch {
    return PUBLIC_SEO_DEFAULTS_DEFAULT
  }
}

// ─── Дефолтные тексты сообщений (редактируемые платформенные) ─────────────────
// НЕ хардкод: платформенный эталон правит админ в /admin. Код-константы из
// lib/hh/default-messages.ts — лишь СИД при пустой БД (последний фолбэк), а не
// источник правды. Наследование платформа→компания→вакансия — в
// lib/messaging/effective-message-defaults.ts.

export const MESSAGE_DEFAULTS_KEY = "message_defaults"

export const MESSAGE_DEFAULTS_SEED: MessageDefaults = {
  inviteMessage:            DEFAULT_INVITE_MESSAGE,
  offHoursMessage:          DEFAULT_OFF_HOURS_MESSAGE,
  firstMessageDelaySeconds: DEFAULT_FIRST_MESSAGE_DELAY_SECONDS,
  rejectMessage:            DEFAULT_REJECT_MESSAGE,
}

/** Платформенные дефолтные тексты. Никогда не падает; пустые поля → сид. */
export async function getPlatformMessageDefaults(): Promise<MessageDefaults> {
  try {
    const v = await getPlatformSetting<Partial<MessageDefaults>>(MESSAGE_DEFAULTS_KEY)
    if (!v || typeof v !== "object") return MESSAGE_DEFAULTS_SEED
    const str = (x: unknown, fb: string) => (typeof x === "string" && x.trim() ? x : fb)
    const num = (x: unknown, fb: number) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : fb)
    return {
      inviteMessage:            str(v.inviteMessage,   MESSAGE_DEFAULTS_SEED.inviteMessage),
      offHoursMessage:          str(v.offHoursMessage, MESSAGE_DEFAULTS_SEED.offHoursMessage),
      firstMessageDelaySeconds: num(v.firstMessageDelaySeconds, MESSAGE_DEFAULTS_SEED.firstMessageDelaySeconds),
      rejectMessage:            str(v.rejectMessage,   MESSAGE_DEFAULTS_SEED.rejectMessage),
    }
  } catch {
    return MESSAGE_DEFAULTS_SEED
  }
}

/** Сохранить платформенные дефолтные тексты (админ). */
export async function setPlatformMessageDefaults(v: MessageDefaults): Promise<void> {
  await setPlatformSetting(MESSAGE_DEFAULTS_KEY, v)
}

// ─── Шаблоны дожима (drip) — редактируемые платформенные ──────────────────────
// Эталон для генерации цепочек касаний в конструкторе воронки. Сид —
// DRIP_TEMPLATES_SEED (код). Правит админ; HR перебивает на стадии.

export const DRIP_TEMPLATES_KEY = "drip_templates"

/** Платформенные drip-шаблоны. Никогда не падает; недостающее → сид. */
export async function getPlatformDripTemplates(): Promise<DripTemplates> {
  try {
    const v = await getPlatformSetting<Partial<DripTemplates>>(DRIP_TEMPLATES_KEY)
    if (!v || typeof v !== "object") return DRIP_TEMPLATES_SEED
    const arr = (x: unknown, fb: string[]) =>
      Array.isArray(x) && x.every(s => typeof s === "string") && x.length > 0 ? (x as string[]) : fb
    return {
      stepWords: (v.stepWords && typeof v.stepWords === "object") ? { ...DRIP_TEMPLATES_SEED.stepWords, ...v.stepWords } : DRIP_TEMPLATES_SEED.stepWords,
      branchA:   arr(v.branchA, DRIP_TEMPLATES_SEED.branchA),
      branchB:   arr(v.branchB, DRIP_TEMPLATES_SEED.branchB),
      live:      arr(v.live,    DRIP_TEMPLATES_SEED.live),
      offer:     arr(v.offer,   DRIP_TEMPLATES_SEED.offer),
    }
  } catch {
    return DRIP_TEMPLATES_SEED
  }
}

/** Сохранить платформенные drip-шаблоны (админ). */
export async function setPlatformDripTemplates(v: DripTemplates): Promise<void> {
  await setPlatformSetting(DRIP_TEMPLATES_KEY, v)
}
