"use client"

import { useEffect } from "react"

// После деплоя у пользователя в открытой вкладке остаётся СТАРЫЙ бандл. При
// следующем действии (server action) сервер отвечает «Failed to find Server
// Action … from an older or newer deployment» — действие молча ломается.
// Этот слушатель ловит такую ошибку и ОДИН раз перезагружает страницу
// (подтягивая свежий бандл). Защита от цикла: не чаще раза в 30 сек.
export function StaleDeploymentReload() {
  useEffect(() => {
    const KEY = "c24-stale-reload-ts"
    let done = false

    function isStale(msg?: string | null): boolean {
      if (!msg) return false
      return (
        msg.includes("Failed to find Server Action") ||
        msg.includes("older or newer deployment")
      )
    }

    function maybeReload(msg?: string | null) {
      if (done || !isStale(msg)) return
      const last = Number(sessionStorage.getItem(KEY) || 0)
      if (Date.now() - last < 30_000) return // уже перезагружали недавно — не зацикливаемся
      done = true
      sessionStorage.setItem(KEY, String(Date.now()))
      window.location.reload()
    }

    const onError = (e: ErrorEvent) => maybeReload(e.message || (e.error as Error | undefined)?.message)
    const onRejection = (e: PromiseRejectionEvent) =>
      maybeReload(typeof e.reason === "string" ? e.reason : (e.reason as Error | undefined)?.message)

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  return null
}
