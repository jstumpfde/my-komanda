"use client"

// Глобальная граница ошибок (App Router). Срабатывает, когда ошибка дошла до
// корневого layout (рендер-краш, флака client-reference-manifest после деплоя
// и т.п.). БЕЗ неё пользователь видел сырую ошибку Next + сервер спамил
// «/500 ENOENT» (нет pages/500.html). Здесь — нормальная страница + кнопка.
//
// Транзиентные ошибки сборки/деплоя (chunk/manifest mismatch у старой вкладки
// после деплоя) лечатся перезагрузкой — для них делаем авто-reload один раз.

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    const msg = `${error?.message ?? ""} ${error?.stack ?? ""}`
    const transient = /ChunkLoadError|client reference manifest|Loading chunk|Failed to find Server Action|Loading CSS chunk/i.test(msg)
    // Авто-перезагрузка один раз: транзиентные деплой-флаки само-лечатся свежими
    // чанками. Защита от цикла — флаг в sessionStorage.
    if (transient && typeof window !== "undefined") {
      try {
        if (!sessionStorage.getItem("ge_reloaded")) {
          sessionStorage.setItem("ge_reloaded", "1")
          window.location.reload()
        }
      } catch { /* sessionStorage недоступен — просто покажем страницу */ }
    }
  }, [error])

  return (
    <html lang="ru">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: "#0b1020", color: "#e5e7eb" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
          <div style={{ maxWidth: 460, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>⚠️</div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>Что-то пошло не так</h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: "#9ca3af", margin: "0 0 20px" }}>
              Произошла ошибка при загрузке страницы. Часто это решается обновлением — попробуйте ещё раз.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => { try { sessionStorage.removeItem("ge_reloaded") } catch {} ; reset() }}
                style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, cursor: "pointer" }}
              >
                Попробовать снова
              </button>
              <button
                onClick={() => { window.location.href = "/" }}
                style={{ background: "transparent", color: "#e5e7eb", border: "1px solid #374151", borderRadius: 8, padding: "10px 18px", fontSize: 14, cursor: "pointer" }}
              >
                На главную
              </button>
            </div>
            {error?.digest && (
              <p style={{ fontSize: 11, color: "#4b5563", marginTop: 18 }}>Код: {error.digest}</p>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}
