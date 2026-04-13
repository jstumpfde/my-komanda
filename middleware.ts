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
  "/join/",
  "/api/auth",
  "/api/access-requests",
  "/api/visit-log",
  "/api/modules",
  "/api/core",
  "/api/plans",
  "/api/dev",
  "/api/public/",
  "/intake/",
  "/vacancy-view/",
  "/demo/",
  "/ask/",
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

  // Публичный маршрут — пропускаем
  if (isPublic(pathname)) return

  // Не авторизован → /login
  if (!session?.user) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return Response.redirect(loginUrl)
  }

  // ── CSRF protection for mutating API requests ──
  if (pathname.startsWith("/api/") && !pathname.startsWith("/api/auth") && !pathname.startsWith("/api/public/")) {
    const method = req.method
    if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
      const origin = req.headers.get("origin")
      const allowedOrigin = process.env.NEXTAUTH_URL || ""
      if (origin && origin !== allowedOrigin && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
        return new Response("Forbidden", { status: 403 })
      }
    }
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
