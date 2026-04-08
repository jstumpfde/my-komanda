"use client"

import { useRef, useEffect, useCallback } from "react"
import { toast } from "sonner"

type SaveFn = (payload: Record<string, unknown>) => Promise<unknown>

/**
 * Автосохранение одного или нескольких полей.
 * - Debounce 1500ms после последнего изменения
 * - Дедупликация тостов: один "Сохранено" за серию правок
 */
export function useAutoSave(saveFn: SaveFn, debounceMs = 1500) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<Record<string, unknown>>({})
  const toastCooldownRef = useRef(false)

  const flush = useCallback(async () => {
    const payload = { ...pendingRef.current }
    if (Object.keys(payload).length === 0) return
    pendingRef.current = {}

    try {
      await saveFn(payload)
      if (!toastCooldownRef.current) {
        toastCooldownRef.current = true
        toast.success("Сохранено", { duration: 2000 })
        setTimeout(() => { toastCooldownRef.current = false }, 2500)
      }
    } catch {
      toast.error("Ошибка сохранения", {
        duration: 5000,
        action: { label: "Повторить", onClick: () => flush() },
      })
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
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  return { schedule, saveNow }
}
