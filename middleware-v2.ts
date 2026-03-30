import { auth } from "@/auth"
import { hasAnyModule, HR_MODULE_SLUGS } from "@/lib/modules/access"

// Node.js runtime — нужен для DB-запросов в middleware
export const runtime = "nodejs"

// Dev-режим: ALLOW_DEV_LOGIN=true → пропускаем все проверки модулей
const DEV_MODE =
  process.env.ALLOW_DEV_LOGIN === "true" ||
  process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true"

// Маршруты без авторизации
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/vacancy/",
  "/candidate/",
  "/schedule/",
  "/ref/",
  "/api/auth",
  "/api/modules",
  "/api/plans",
  "/api/dev",
  "/api/public",
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p)
  )
}

// Маппинг путей → модули
const MODULE_PATH_MAP: { prefix: string; slugs: string[]; moduleParam: string }[] = [
  { prefix: "/hr/",        slugs: HR_MODULE_SLUGS,   moduleParam: "recruiting" },
  { prefix: "/marketing/", slugs: ["marketing"],      moduleParam: "marketing" },
  { prefix: "/sales/",     slugs: ["sales"],          moduleParam: "sales" },
  { prefix: "/logistics/", slugs: ["logistics"],      moduleParam: "logistics" },
]

export default auth(async (req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  // Публичный маршрут
  if (isPublic(pathname)) return

  // Не авторизован → /login
  if (!session?.user) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return Response.redirect(loginUrl)
  }

  // API-маршруты пропускаем (иначе POST→307→HTML)
  if (pathname.startsWith("/api/")) return

  // Нет company_id → /register (шаг 2: компания)
  const onboardingDone = req.cookies.get("mk_onboarded")?.value === "1"
  if (!session.user.companyId && !pathname.startsWith("/register") && !onboardingDone) {
    return Response.redirect(new URL("/register", req.url))
  }

  // Dev-режим — пропускаем проверку модулей
  if (DEV_MODE) return

  // Проверка доступа к модулям
  if (!session.user.companyId || pathname.startsWith("/upgrade")) return

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
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
