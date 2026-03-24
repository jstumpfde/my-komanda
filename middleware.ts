import { auth } from "@/auth"

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
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p)
  )
}

export default auth((req) => {
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

  // Авторизован, нет company_id, не на /onboarding → /onboarding
  // Исключение: кука mk_onboarded=1 означает что онбординг завершён
  // (ставится когда сессия ещё не обновилась или работает демо-режим)
  const onboardingDone = req.cookies.get("mk_onboarded")?.value === "1"
  if (!session.user.companyId && !pathname.startsWith("/onboarding") && !onboardingDone) {
    return Response.redirect(new URL("/onboarding", req.url))
  }
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
