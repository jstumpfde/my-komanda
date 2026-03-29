import { auth } from "@/auth"
import { hasAnyModule, HR_MODULE_SLUGS } from "@/lib/modules/access"

// Node.js runtime — нужен для DB-запросов в middleware
export const runtime = "nodejs"

// Маршруты доступны без авторизации
const PUBLIC_PREFIXES = [
  "/login",
  "/register",
  "/vacancy/",
  "/candidate/",
  "/schedule/",
  "/ref/",
  "/onboarding",
  "/api/auth",
  "/api/modules",
  "/api/plans",
  "/api/dev",
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p)
  )
}

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

  // API-маршруты пропускаем без редиректа на /onboarding —
  // иначе POST /api/companies и POST /api/vacancies во время онбординга
  // получали бы 307 → HTML → res.json() кидал исключение → тихий fallback
  if (pathname.startsWith("/api/")) return

  // Авторизован, нет company_id, не на /register → /register (шаг 2: компания)
  // Исключение: кука mk_onboarded=1 означает что онбординг завершён
  // (ставится когда сессия ещё не обновилась или работает демо-режим)
  const onboardingDone = req.cookies.get("mk_onboarded")?.value === "1"
  if (!session.user.companyId && !pathname.startsWith("/register") && !onboardingDone) {
    return Response.redirect(new URL("/register", req.url))
  }

  // Проверка доступа к HR-модулям: /hr/* требует хотя бы одного активного HR-модуля
  if (
    session.user.companyId &&
    pathname.startsWith("/hr/") &&
    !pathname.startsWith("/upgrade")
  ) {
    // hasAnyModule уже содержит try/catch и двойной fallback (slug → anyActive)
    const hasHR = await hasAnyModule(session.user.companyId, HR_MODULE_SLUGS)
    if (!hasHR) {
      // Защита от redirect-loop: если откуда-то попали сюда снова — пропускаем
      const ref = req.headers.get("referer") ?? ""
      if (!ref.includes("/upgrade")) {
        return Response.redirect(new URL("/upgrade?module=recruiting", req.url))
      }
    }
  }
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
