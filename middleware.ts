import { auth } from "@/auth"
import { hasAnyModule, HR_MODULE_SLUGS } from "@/lib/modules/access"

// Node.js runtime — нужен для DB-запросов в middleware
export const runtime = "nodejs"

// Маршруты доступны без авторизации
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/landing",
  "/vacancy/",
  "/candidate/",
  "/schedule/",
  "/ref/",
  "/v/",
  "/api/auth",
  "/api/access-requests",
  "/api/visit-log",
  "/api/modules",
  "/api/plans",
  "/api/dev",
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
  { prefix: "/logistics/",  slugs: ["logistics"],   moduleParam: "logistics" },
  { prefix: "/knowledge/", slugs: ["knowledge"],   moduleParam: "knowledge" },
]

export default auth(async (req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

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
  // DEV_SKIP_MODULE_CHECK=true — пропускаем проверку модулей полностью
  if (process.env.DEV_SKIP_MODULE_CHECK === "true") return

  // Пропускаем /upgrade (иначе бесконечный редирект) и маршруты без companyId
  if (!session.user.companyId || pathname.startsWith("/upgrade")) return

  for (const { prefix, slugs, moduleParam } of MODULE_PATH_MAP) {
    if (pathname.startsWith(prefix)) {
      const hasAccess = await hasAnyModule(session.user.companyId, slugs)
      if (!hasAccess) {
        return Response.redirect(
          new URL(`/upgrade?module=${moduleParam}`, req.url)
        )
      }
      break // matched — no need to check further
    }
  }
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
