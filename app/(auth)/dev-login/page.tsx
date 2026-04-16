import { cookies } from "next/headers"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import DevLoginClient from "./DevLoginClient"
import KeyGate from "./KeyGate"

export const metadata: Metadata = {
  title: "Dev login",
  robots: { index: false, follow: false },
}

export default async function DevLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>
}) {
  const envKey = process.env.DEV_LOGIN_KEY
  const localDevOpen =
    !envKey &&
    (process.env.NODE_ENV === "development" ||
      process.env.ALLOW_DEV_LOGIN === "true")

  // Dev-login полностью отключён (ни ключа, ни dev-флагов) → на /login
  if (!envKey && !localDevOpen) redirect("/login")

  const sp = await searchParams
  const queryKey = sp.key
  const cookieKey = (await cookies()).get("dev_login_key")?.value

  const authorized = localDevOpen || (!!envKey && (queryKey === envKey || cookieKey === envKey))

  if (!authorized) return <KeyGate />

  // Если ключ пришёл из query, но cookie ещё нет — клиент поставит cookie
  // через gate API для удобства повторных визитов.
  return <DevLoginClient persistKey={!!envKey && queryKey === envKey && cookieKey !== envKey ? queryKey : null} />
}
