"use client"

import { useEffect } from "react"

// Разбирает hex-цвет (#RRGGBB или #RGB) в { r, g, b } (0–255).
function parseHex(hex: string): { r: number; g: number; b: number } | null {
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return null
  let h = hex.slice(1)
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

// Relative luminance по WCAG 2.1.
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const ch = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

// Дефолтный цвет AI-элементов (платформенный фиолетовый).
const DEFAULT_AI_COLOR = "#9437ff"

/**
 * Применяет цвет нейросети как CSS-переменную --ai (и --ai-foreground) на :root.
 * Может вызываться из любого клиентского кода.
 * При невалидном/пустом hex — применяет дефолт.
 */
export function applyAiColor(hex: string): void {
  if (typeof document === "undefined") return
  const target = hex && parseHex(hex) ? hex : DEFAULT_AI_COLOR
  const rgb = parseHex(target)
  if (!rgb) return

  const lum = luminance(rgb)
  const foreground = lum > 0.35 ? "#0b1220" : "#ffffff"

  const root = document.documentElement
  root.style.setProperty("--ai", target)
  root.style.setProperty("--ai-foreground", foreground)
}

/**
 * Клиентский компонент: при монтировании загружает aiColor компании
 * и инжектирует CSS-переменные в <html>. Подключается в providers.tsx.
 * Работает только для авторизованных пользователей (401 → тихо игнорируется).
 * Дефолт: #9437ff (если настройка не задана).
 */
export function AiColorInjector() {
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        // Применяем дефолт немедленно — до ответа API, чтобы AI-элементы
        // сразу отображались нужным цветом без мигания.
        applyAiColor(DEFAULT_AI_COLOR)

        const res = await fetch("/api/companies")
        if (!res.ok) return
        const data = await res.json() as Record<string, unknown>
        if (cancelled) return

        const customTheme = (data.customTheme ?? data.custom_theme) as Record<string, unknown> | undefined
        const color = customTheme?.aiColor as string | undefined
        applyAiColor(color ?? DEFAULT_AI_COLOR)
      } catch {
        // Сетевая ошибка или публичная страница — игнорируем
      }
    }

    void load()

    // Реагируем на событие «company-updated» (после сохранения брендинга)
    const onUpdate = () => { void load() }
    window.addEventListener("company-updated", onUpdate)

    return () => {
      cancelled = true
      window.removeEventListener("company-updated", onUpdate)
    }
  }, [])

  return null
}
