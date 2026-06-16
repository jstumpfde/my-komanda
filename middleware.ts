import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { HR_MODULE_SLUGS, hasAnyModule } from "@/lib/modules/access"
import { db } from "@/lib/db"
import { tenantModules } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { isPartnerRole } from "@/lib/roles"
import type { UserRole } from "@/lib/roles"

// Хосты платформы — НЕ поддомены компаний.
const PLATFORM_HOSTS = new Set(["company24.pro", "www.company24.pro", "new.company24.pro", "localhost"])

// Извлечь поддомен компании из Host ({sub}.company24.pro → "sub"), иначе null.
function getCompanySubdomain(host: string): string | null {
  const h = host.split(":")[0].toLowerCase()
  if (PLATFORM_HOSTS.has(h)) return null
  if (h.endsWith(".company24.pro")) {
    const sub = h.slice(0, -".company24.pro".length)
    if (sub && sub !== "www" && sub !== "new" && !sub.includes(".")) return sub
  }
  return null
}

// Node.js runtime — нужен для DB-запросов в middleware
export const runtime = "nodejs"

// Маршруты доступны без авторизации
const PUBLIC_PREFIXES = [
  "/login",
  "/dev-login",
  "/register",
  "/forgot-password",   // страница запроса сброса пароля (без логина)
  "/reset-password",    // страница установки нового пароля по токену из письма
  "/landing",
  "/vacancy/",
  "/candidate/",
  "/candidate-update/", // публичная страница самообновления данных кандидата (токен-ссылка)
  "/schedule/",
  "/ref/",
  "/v/",
  "/f/",                // публичная форма Резерва (tracking-ссылка)
  "/join/",
  "/api/auth",          // sign-in/out + forgot-password/reset-password
  "/api/cron/",         // cron-эндпоинты — защищены X-Cron-Secret в самом роуте,
                        // а не сессией NextAuth.
  "/api/access-requests",
  "/api/visit-log",
  "/api/modules",
  "/api/core",
  "/api/plans",
  "/api/dev",
  "/api/public/",
  "/api/tts",
  "/intake/",
  "/vacancy-view/",
  "/demo/",
  "/test/",             // публичная страница прохождения теста по токен-ссылке
  "/compare/",          // публичная ссылка на сравнение кандидатов (share-токен)
  "/report/",           // публичная ссылка на отчёт по найму (share-токен, в т.ч. TV-режим)
  "/politicahr2026",
  "/ask/",
  "/uploads/",
  "/careers",            // публичная карьерная страница компании (поддомен)
  "/jobs/",              // карьерная страница компании по слагу: /jobs/{companySlug}
  // Публичные маркетинговые и юридические страницы (группа (public)) — без них
  // неавторизованный посетитель редиректился на /login вместо контента.
  "/about",
  "/contact",
  "/changelog",
  "/privacy",
  "/terms",
  "/status",
  "/team",
  // Webhook кандидатского TG-бота: запросы приходят от серверов Telegram (без
  // сессии), роут сам проверяет обязательный X-Telegram-Bot-Api-Secret-Token.
  "/api/telegram/candidate-bot/webhook",
  // Webhook Авито: приходит от серверов Авито (без сессии), роут сам проверяет
  // AVITO_WEBHOOK_SECRET. Без этого Авито-серверы получали бы 302 на /login.
  "/api/webhooks/avito",
]

function isPublic(pathname: string): boolean {
  if (pathname === "/") return true
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p)
  )
}

// Маппинг путей → модули (slugs для проверки в БД)
const MODULE_PATH_MAP: { prefix: string; slugs: string[]; moduleParam: string }[] = [
  { prefix: "/hr/",        slugs: HR_MODULE_SLUGS, moduleParam: "recruiting" },
  { prefix: "/marketing/", slugs: ["marketing"],   moduleParam: "marketing" },
  { prefix: "/sales/",     slugs: ["sales"],       moduleParam: "sales" },
  { prefix: "/warehouse/", slugs: ["warehouse"],   moduleParam: "warehouse" },
  { prefix: "/knowledge-v2/", slugs: ["knowledge"], moduleParam: "knowledge" },
  { prefix: "/tasks/",     slugs: ["tasks"],       moduleParam: "tasks" },
  { prefix: "/booking/",   slugs: ["booking"],     moduleParam: "booking" },
]

export default auth(async (req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // ── Поддомен компании ({sub}.company24.pro) ───────────────────────────────
  // Корень поддомена → карьерная страница компании (/careers?sub=...). Остальные
  // публичные пути (vacancy/demo/…) работают как есть — слаги глобальны.
  const sub = getCompanySubdomain(req.headers.get("host") || "")
  if (sub && (pathname === "/" || pathname === "/careers")) {
    const url = req.nextUrl.clone()
    url.pathname = "/careers"
    url.searchParams.set("sub", sub)
    return NextResponse.rewrite(url)
  }

  // Публичный маршрут — пропускаем
  if (isPublic(pathname)) return

  // Не авторизован → /login
  if (!session?.user) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return Response.redirect(loginUrl)
  }

  // API-маршруты пропускаем без редиректа —
  // иначе POST-запросы получают 307 → HTML → res.json() кидает исключение
  if (pathname.startsWith("/api/")) return

  // Авторизован, нет company_id, не на /register → /register (шаг 2: компания)
  const onboardingDone = req.cookies.get("mk_onboarded")?.value === "1"
  if (!session.user.companyId && !pathname.startsWith("/register") && !onboardingDone) {
    return Response.redirect(new URL("/register", req.url))
  }

  // ── Партнёр видит ТОЛЬКО свой кабинет /partner ─────────────────────────────
  // Роль partner не должна попадать в HR/админку/основной дашборд. Любой
  // непубличный путь вне /partner → редирект на /partner (API уже пропущены выше).
  if (isPartnerRole(session.user.role as UserRole) && !pathname.startsWith("/partner")) {
    return Response.redirect(new URL("/partner", req.url))
  }

  // ── Проверка доступа к модулям ──────────────────────────────────────────────
  // OPT-IN: гейтинг ВЫКЛЮЧЕН по умолчанию, включается только MODULE_GATING_ENABLED=true.
  // Причина: реестр `modules` пока неполный (нет knowledge/learning/tasks и т.д.),
  // а hasAnyModule-fallback + частичный реестр спрятали бы реальные пункты меню у
  // существующих клиентов. Включаем ТОЛЬКО после полной настройки модулей+тарифов.
  // Grandfather-правило (когда включён): нет записей в tenant_modules → полный доступ.
  if (process.env.MODULE_GATING_ENABLED === "true") {
    if (session.user.companyId && !pathname.startsWith("/upgrade")) {
      for (const { prefix, slugs, moduleParam } of MODULE_PATH_MAP) {
        if (pathname.startsWith(prefix)) {
          try {
            // Grandfather: проверяем есть ли вообще хоть одна запись у компании
            const [anyRecord] = await db
              .select({ id: tenantModules.id })
              .from(tenantModules)
              .where(eq(tenantModules.tenantId, session.user.companyId))
              .limit(1)

            if (!anyRecord) {
              // Старый клиент без tenant_modules — полный доступ, не трогаем
              break
            }

            // У компании есть записи — проверяем конкретный модуль
            const hasAccess = await hasAnyModule(session.user.companyId, slugs)
            if (!hasAccess) {
              return Response.redirect(
                new URL(`/upgrade?module=${moduleParam}`, req.url)
              )
            }
          } catch {
            // При ошибке БД — fail-open, пропускаем (не ломаем прод)
          }
          break
        }
      }
    }
  }
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
