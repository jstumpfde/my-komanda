"use client"

import { useEffect, useState } from "react"

// Простой debounce-хук без внешних зависимостей.
// Возвращает значение, обновляющееся не чаще раза в `ms` миллисекунд.
export function useDebounce<T>(value: T, ms: number = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])

  return debounced
}
