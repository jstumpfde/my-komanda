"use client"

// Поле «Дата рождения» с маской ДД.ММ.ГГГГ — по образцу
// app/(public)/demo/[token]/demo-client.tsx (maskBirthDateRu/isValidBirthDateRu),
// но с собственной клиентской валидацией под формат "ДД.ММ.ГГГГ" контракта
// POST /api/public/tip/run (без ISO-конвертации — бэкенд сам парсит русский формат).

import { Input } from "@/components/ui/input"

/** Применяет маску ДД.ММ.ГГГГ: оставляет только цифры, расставляет точки. */
export function maskBirthDate(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 4)}.${digits.slice(4)}`
}

/** Валидация формата ДД.ММ.ГГГГ: реальная дата, год 1900..текущий, не в будущем. */
export function isValidBirthDate(s: string): boolean {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s.trim())
  if (!m) return false
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (year < 1900 || year > new Date().getFullYear()) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return false
  const today = new Date()
  const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()))
  if (d.getTime() > todayUtc.getTime()) return false
  return true
}

export function BirthDateInput({
  value,
  onChange,
  invalid,
  autoFocus,
  id,
}: {
  value: string
  onChange: (v: string) => void
  invalid?: boolean
  autoFocus?: boolean
  id?: string
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      autoComplete="bday"
      placeholder="ДД.ММ.ГГГГ"
      value={value}
      autoFocus={autoFocus}
      aria-invalid={invalid || undefined}
      onChange={(e) => onChange(maskBirthDate(e.target.value))}
      className="h-12 text-center text-lg font-medium tracking-wide sm:text-left"
      maxLength={10}
    />
  )
}
