"use client"

import { useEffect } from "react"

// Авто-восстановление при устаревшем бандле.
//
// После деплоя у пользователя с уже открытой вкладкой остаётся старый HTML/JS.
// Браузер пытается подгрузить JS-чанк со старым хешем, которого в новой сборке
// уже нет → ChunkLoadError → белый экран / неработающие кнопки. Этот guard
// ловит такие ошибки и ОДИН раз перезагружает страницу, чтобы забрать свежий
// бандл. Серверный код не трогаем — лечим именно вкладку клиента.
//
// Защита от цикла перезагрузок:
//  - не чаще RELOAD_COOLDOWN_MS между попытками,
//  - не более MAX_RELOADS подряд в пределах эпизода (EPISODE_RESET_MS).
// Если перезагрузка не помогла — значит проблема не в устаревшем бандле; даём
// ошибке всплыть штатно вместо бесконечного reload.

const STORAGE_KEY = "bundle-reload-state"
const RELOAD_COOLDOWN_MS = 10_000
const EPISODE_RESET_MS = 60_000
const MAX_RELOADS = 2

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false
  const name = typeof err === "object" ? (err as { name?: string }).name ?? "" : ""
  const message =
    typeof err === "string"
      ? err
      : String((err as { message?: string })?.message ?? err)
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w./-]+ failed/i.test(message) ||
    /Loading CSS chunk/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message)
  )
}

function maybeReload() {
  let count = 0
  let last = 0
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { count?: number; ts?: number }
      count = parsed.count ?? 0
      last = parsed.ts ?? 0
    }
  } catch {
    // sessionStorage недоступен (приватный режим/блокировка) — работаем без памяти
  }

  const now = Date.now()
  // прошлая перезагрузка была давно → считаем это новым эпизодом
  if (now - last > EPISODE_RESET_MS) count = 0
  if (count >= MAX_RELOADS) return // не циклимся, если reload не помог
  if (last && now - last < RELOAD_COOLDOWN_MS) return // слишком частые попытки

  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ count: count + 1, ts: now }),
    )
  } catch {
    // ignore
  }
  window.location.reload()
}

export function BundleRefreshGuard() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
        maybeReload()
      }
    }
    function onRejection(event: PromiseRejectionEvent) {
      if (isChunkLoadError(event.reason)) {
        maybeReload()
      }
    }
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  return null
}
