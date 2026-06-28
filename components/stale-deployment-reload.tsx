"use client"

import { useEffect } from "react"

// После деплоя у пользователя в открытой вкладке остаётся СТАРЫЙ бандл. Два
// механизма обнаружения:
//
// 1. Server Action ошибка (для авторизованных страниц): сервер отвечает
//    «Failed to find Server Action … from an older or newer deployment» —
//    действие молча ломается. Ловим через window.error / unhandledrejection.
//
// 2. Build ID polling (для публичных страниц — демо/тест кандидата): при
//    возврате на вкладку (visibilitychange) сравниваем NEXT_PUBLIC_BUILD_ID,
//    вшитый в текущий бандл, с актуальным buildId сервера из /api/public/build-id.
//    Если они расходятся — перезагружаем страницу.
//
// Защита от цикла: не чаще раза в 30 сек (sessionStorage).
// Guard от прерывания кандидата в середине действия: polling срабатывает
// ТОЛЬКО при visibilitychange (пользователь переключился на другую вкладку и
// вернулся), а не во время активного взаимодействия.
export function StaleDeploymentReload() {
  useEffect(() => {
    const KEY = "c24-stale-reload-ts"
    let done = false

    function canReload(): boolean {
      if (done) return false
      const last = Number(sessionStorage.getItem(KEY) || 0)
      return Date.now() - last >= 30_000
    }

    function doReload() {
      done = true
      sessionStorage.setItem(KEY, String(Date.now()))
      window.location.reload()
    }

    // ── Механизм 1: Server Action errors ─────────────────────────────────────
    function isStale(msg?: string | null): boolean {
      if (!msg) return false
      return (
        msg.includes("Failed to find Server Action") ||
        msg.includes("older or newer deployment")
      )
    }

    function maybeReload(msg?: string | null) {
      if (!isStale(msg) || !canReload()) return
      doReload()
    }

    const onError = (e: ErrorEvent) => maybeReload(e.message || (e.error as Error | undefined)?.message)
    const onRejection = (e: PromiseRejectionEvent) =>
      maybeReload(typeof e.reason === "string" ? e.reason : (e.reason as Error | undefined)?.message)

    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)

    // ── Механизм 2: Build ID polling (публичные страницы — демо/тест) ────────
    // NEXT_PUBLIC_BUILD_ID инлайнится Next.js при СБОРКЕ в клиентский бандл.
    // Старая вкладка несёт СТАРЫЙ id; живой сервер на /api/public/build-id
    // отдаёт НОВЫЙ id → расхождение → перезагрузка. Свежая вкладка совпадает —
    // перезагрузки нет. Локально (id пуст или "dev") — no-op.
    // Не прерываем кандидата в процессе: firing ТОЛЬКО на visibilitychange.
    const initialBuildId = process.env.NEXT_PUBLIC_BUILD_ID

    async function checkBuildId() {
      if (!initialBuildId || initialBuildId === "dev" || !canReload()) return
      try {
        const res = await fetch("/api/public/build-id", { cache: "no-store" })
        if (!res.ok) return
        const { buildId } = (await res.json()) as { buildId?: string }
        if (buildId && buildId !== initialBuildId) {
          doReload()
        }
      } catch {
        // Сеть недоступна — не перезагружаем, попробуем при следующем возврате.
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void checkBuildId()
      }
    }

    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [])

  return null
}
