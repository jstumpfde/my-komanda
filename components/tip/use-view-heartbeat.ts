"use client"

// Heartbeat аналитики страницы результата: каждые 10 сек, пока вкладка
// видима (document.visibilityState === 'visible'), fire-and-forget POST
// /api/public/tip/view { token, seconds, scrollPct, source }. Без обработки
// ответа — если роут ещё не существует (координатор добавляет отдельно),
// просто проглатываем ошибку сети (fetch внутри try/catch).

import { useEffect, useRef } from "react"

const HEARTBEAT_MS = 10_000

function detectSource(searchParams: URLSearchParams): string {
  const src = searchParams.get("src")
  if (src) return src
  if (typeof document !== "undefined" && document.referrer) {
    try {
      const host = new URL(document.referrer).hostname
      if (host.includes("t.me") || host.includes("telegram")) return "tg"
      if (host.includes("vk.com")) return "vk"
      if (host.includes("whatsapp")) return "whatsapp"
      return host
    } catch {
      return "unknown"
    }
  }
  return "direct"
}

export function useViewHeartbeat(token: string | undefined) {
  const maxScrollPctRef = useRef(0)

  useEffect(() => {
    if (!token) return

    function updateScroll() {
      const doc = document.documentElement
      const scrollable = doc.scrollHeight - doc.clientHeight
      const pct = scrollable > 0 ? Math.min(100, Math.round((window.scrollY / scrollable) * 100)) : 100
      if (pct > maxScrollPctRef.current) maxScrollPctRef.current = pct
    }

    window.addEventListener("scroll", updateScroll, { passive: true })
    updateScroll()

    const source = detectSource(new URLSearchParams(window.location.search))

    const interval = setInterval(() => {
      if (document.visibilityState !== "visible") return
      try {
        const body = JSON.stringify({
          token,
          seconds: HEARTBEAT_MS / 1000,
          scrollPct: maxScrollPctRef.current,
          source,
        })
        fetch("/api/public/tip/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {
          // fire-and-forget — роут может быть ещё не готов, не мешаем UI.
        })
      } catch {
        // JSON.stringify/fetch недоступны в каком-то окружении — не критично.
      }
    }, HEARTBEAT_MS)

    return () => {
      window.removeEventListener("scroll", updateScroll)
      clearInterval(interval)
    }
  }, [token])
}
