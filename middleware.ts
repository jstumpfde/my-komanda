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

  // Авторизован, нет company_id, не на /onboarding → /onboarding
  if (!session.user.companyId && !pathname.startsWith("/onboarding")) {
    return Response.redirect(new URL("/onboarding", req.url))
  }
})

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}
