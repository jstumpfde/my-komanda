"use client"

import { useEffect } from "react"

// После деплоя у пользователя в открытой вкладке остаётся СТАРЫЙ бандл.
// Два механизма обновления:
//   1) ПРОАКТИВНО — сравниваем вшитый в бандл NEXT_PUBLIC_BUILD_ID с живым
//      /api/public/build-id (на загрузке, при возврате фокуса на вкладку и раз
//      в 5 минут). Если build-id сменился — один раз перезагружаем страницу.
//      Это лечит «вижу старую версию после деплоя» без действий пользователя.
//   2) РЕАКТИВНО — если старый бандл дёрнул server action из другого деплоя,
//      сервер отвечает «Failed to find Server Action … older or newer
//      deployment»; ловим эту ошибку и тоже перезагружаемся.
// Защита от цикла: не чаще раза в 30 сек + не повторяем для одного build-id.
export function StaleDeploymentReload() {
  useEffect(() => {
    const TS_KEY = "c24-stale-reload-ts"
    const SEEN_KEY = "c24-stale-reloaded-for"
    const current = process.env.NEXT_PUBLIC_BUILD_ID || ""
    let done = false

    function reloadOnce() {
      if (done) return
      const last = Number(sessionStorage.getItem(TS_KEY) || 0)
      if (Date.now() - last < 30_000) return // недавно перезагружали — не зацикливаемся
      done = true
      sessionStorage.setItem(TS_KEY, String(Date.now()))
      window.location.reload()
    }

    // (1) Проактивная проверка build-id.
    async function checkBuildId() {
      if (!current || current === "dev" || done) return
      try {
        const res = await fetch("/api/public/build-id", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { buildId?: string }
        const live = data.buildId
        if (!live || live === "dev" || live === current) return
        // Уже перезагружались под этот билд в этой сессии — не повторяем
        // (страховка от цикла, если вшивание build-id рассинхронено).
        if (sessionStorage.getItem(SEEN_KEY) === live) return
        sessionStorage.setItem(SEEN_KEY, live)
        reloadOnce()
      } catch {
        /* офлайн / сеть — игнорируем */
      }
    }

    // (2) Реактивная: server action из старого/нового деплоя.
    function isStale(msg?: string | null): boolean {
      if (!msg) return false
      return (
        msg.includes("Failed to find Server Action") ||
        msg.includes("older or newer deployment")
      )
    }
    const onError = (e: ErrorEvent) => {
      if (isStale(e.message || (e.error as Error | undefined)?.message)) reloadOnce()
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      const m = typeof e.reason === "string" ? e.reason : (e.reason as Error | undefined)?.message
      if (isStale(m)) reloadOnce()
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkBuildId()
    }

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    document.addEventListener("visibilitychange", onVisible)
    void checkBuildId()
    const iv = window.setInterval(() => void checkBuildId(), 5 * 60_000)

    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
      document.removeEventListener("visibilitychange", onVisible)
      window.clearInterval(iv)
    }
  }, [])

  return null
}
