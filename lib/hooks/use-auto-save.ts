"use client"

import { useState, useRef, useEffect, useCallback } from "react"

type SaveFn = (payload: Record<string, unknown>) => Promise<unknown>
type CanSaveFn = () => boolean

export type AutoSaveStatus = "idle" | "saving" | "saved"

/**
 * Автосохранение одного или нескольких полей.
 * - Debounce 1500ms после последнего изменения
 * - Проверка canSave перед отправкой (валидация)
 * - Статус: idle → saving → saved (2с) → idle
 */
export function useAutoSave(saveFn: SaveFn, options?: { debounceMs?: number; canSave?: CanSaveFn }) {
  const debounceMs = options?.debounceMs ?? 1500
  const canSaveRef = useRef(options?.canSave)
  canSaveRef.current = options?.canSave

  const [status, setStatus] = useState<AutoSaveStatus>("idle")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<Record<string, unknown>>({})

  const flush = useCallback(async () => {
    const payload = { ...pendingRef.current }
    if (Object.keys(payload).length === 0) return

    // Check validation before saving
    if (canSaveRef.current && !canSaveRef.current()) return

    pendingRef.current = {}
    setStatus("saving")

    try {
      await saveFn(payload)
      setStatus("saved")
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setStatus("idle"), 2000)
    } catch {
      setStatus("idle")
    }
  }, [saveFn])

  const schedule = useCallback((field: string, value: unknown) => {
    pendingRef.current[field] = value
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(flush, debounceMs)
  }, [flush, debounceMs])

  const saveNow = useCallback((field: string, value: unknown) => {
    pendingRef.current[field] = value
    if (timerRef.current) clearTimeout(timerRef.current)
    flush()
  }, [flush])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
  }, [])

  return { schedule, saveNow, status }
}
