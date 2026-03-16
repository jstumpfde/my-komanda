"use client"

import { useState, useEffect, useCallback } from "react"

export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(initialValue)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key)
      if (item) {
        setStoredValue(deserialize(JSON.parse(item)))
      }
    } catch {
      // ignore errors
    }
    setIsHydrated(true)
  }, [key])

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const newValue = value instanceof Function ? value(prev) : value
        try {
          window.localStorage.setItem(key, JSON.stringify(newValue))
        } catch {
          // ignore quota errors
        }
        return newValue
      })
    },
    [key]
  )

  return [storedValue, setValue]
}

// Revive Date strings back to Date objects
function deserialize(obj: unknown): any {
  if (obj === null || obj === undefined) return obj
  if (typeof obj === "string") {
    // ISO date string pattern
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(obj)) {
      return new Date(obj)
    }
    return obj
  }
  if (Array.isArray(obj)) {
    return obj.map(deserialize)
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = deserialize(v)
    }
    return result
  }
  return obj
}
