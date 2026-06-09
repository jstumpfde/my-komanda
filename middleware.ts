import { auth } from "@/auth"
import { NextResponse } from "next/server"
import {HR_MODULE_SLUGS} from "@/lib/modules/access"

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
  { prefix: "/knowledge/", slugs: ["knowledge"],   moduleParam: "knowledge" },
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

  // ── Проверка доступа к модулям ──────────────────────────────────────────────
  // TODO: включить обратно когда настроим биллинг
  // Временно все модули доступны — блок ниже отключён
  /*
  if (process.env.DEV_SKIP_MODULE_CHECK !== "true") {
    if (session.user.companyId && !pathname.startsWith("/upgrade")) {
      for (const { prefix, slugs, moduleParam } of MODULE_PATH_MAP) {
        if (pathname.startsWith(prefix)) {
          const hasAccess = await hasAnyModule(session.user.companyId, slugs)
          if (!hasAccess) {
            return Response.redirect(
              new URL(`/upgrade?module=${moduleParam}`, req.url)
            )
          }
          break
        }
      }
    }
  }
  */
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
