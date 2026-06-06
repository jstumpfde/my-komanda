"use client"

import { useEffect } from "react"

// Разбирает hex-цвет (#RRGGBB или #RGB) в { r, g, b } (0–255).
// Возвращает null, если строка не является валидным hex.
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

/**
 * Применяет цвет бренда как CSS-переменные на documentElement.
 * Может вызываться из любого клиентского кода (branding page, injector).
 * При невалидном/пустом hex — ничего не делает.
 */
export function applyBrandColor(hex: string): void {
  if (typeof document === "undefined") return
  const rgb = parseHex(hex)
  if (!rgb) return

  const lum = luminance(rgb)
  // Порог WCAG: контрастный цвет текста на кнопке.
  // Светлый цвет бренда (lum > 0.35) → тёмный текст, иначе → белый.
  const foreground = lum > 0.35 ? "#0b1220" : "#ffffff"

  const root = document.documentElement
  root.style.setProperty("--primary", hex)
  root.style.setProperty("--ring", hex)
  root.style.setProperty("--primary-foreground", foreground)
  // sidebar-primary — цвет активного пункта в сайдбаре (текст/иконка)
  root.style.setProperty("--sidebar-primary", hex)
}

/**
 * Сбрасывает инжектированные переменные (возврат к теме по умолчанию).
 */
export function resetBrandColor(): void {
  if (typeof document === "undefined") return
  const root = document.documentElement
  root.style.removeProperty("--primary")
  root.style.removeProperty("--ring")
  root.style.removeProperty("--primary-foreground")
  root.style.removeProperty("--sidebar-primary")
}

/**
 * Клиентский компонент: при монтировании загружает brandPrimaryColor компании
 * и инжектирует CSS-переменные в <html>. Подключается в providers.tsx.
 * Работает только для авторизованных пользователей (401 → тихо игнорируется).
 */
export function BrandColorInjector() {
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await fetch("/api/companies")
        if (!res.ok) return // 401 / ошибка — ничего не делаем
        const data = await res.json() as Record<string, unknown>
        if (cancelled) return
        const color = (data.brandPrimaryColor ?? data.brand_primary_color) as string | undefined
        if (color) applyBrandColor(color)
      } catch {
        // Сетевая ошибка или публичная страница без авторизации — игнорируем
      }
    }

    void load()

    // Реагируем на событие «company-updated» (после сохранения брендинга)
    // чтобы без перезагрузки отразить новый цвет
    const onUpdate = () => { void load() }
    window.addEventListener("company-updated", onUpdate)

    return () => {
      cancelled = true
      window.removeEventListener("company-updated", onUpdate)
    }
  }, [])

  return null
}
