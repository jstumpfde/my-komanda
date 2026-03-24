"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { type Demo, type Lesson } from "@/lib/course-types"

export interface ApiDemo {
  id: string
  vacancyId: string
  title: string
  status: "draft" | "published"
  lessonsJson: Lesson[]
  createdAt: string
  updatedAt: string
}

function apiDemoToDemo(d: ApiDemo): Demo {
  return {
    id: d.id,
    title: d.title,
    companyName: "",
    description: "",
    status: d.status,
    createdAt: new Date(d.createdAt),
    updatedAt: new Date(d.updatedAt),
    coverGradientFrom: "#6366f1",
    coverGradientTo: "#8b5cf6",
    lessons: d.lessonsJson ?? [],
  }
}

interface UseDemoResult {
  demo: Demo | null
  loading: boolean
  error: string | null
  saveStatus: "saved" | "saving" | "error" | "idle"
  createDemo: (title: string, lessons: Lesson[]) => Promise<Demo | null>
  updateDemo: (updated: Demo) => void
}

export function useDemo(vacancyId: string | null): UseDemoResult {
  const [demo, setDemo] = useState<Demo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error" | "idle">("idle")

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDemoRef = useRef<Demo | null>(null)

  // Load demo on mount
  useEffect(() => {
    if (!vacancyId) return
    setLoading(true)
    setError(null)

    fetch(`/api/demos?vacancy_id=${encodeURIComponent(vacancyId)}`)
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then((json: { data?: ApiDemo[] }) => {
        const rows = json.data ?? (json as unknown as ApiDemo[])
        if (Array.isArray(rows) && rows.length > 0) {
          const d = apiDemoToDemo(rows[0])
          setDemo(d)
          latestDemoRef.current = d
          setSaveStatus("saved")
        }
      })
      .catch(() => setError("Не удалось загрузить демо"))
      .finally(() => setLoading(false))
  }, [vacancyId])

  const persistUpdate = useCallback(async (updated: Demo) => {
    setSaveStatus("saving")
    try {
      const res = await fetch(`/api/demos/${updated.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: updated.title,
          status: updated.status,
          lessons_json: updated.lessons,
        }),
      })
      if (!res.ok) throw new Error("save failed")
      setSaveStatus("saved")
    } catch {
      setSaveStatus("error")
    }
  }, [])

  const updateDemo = useCallback((updated: Demo) => {
    setDemo(updated)
    latestDemoRef.current = updated
    setSaveStatus("saving")

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (latestDemoRef.current) {
        persistUpdate(latestDemoRef.current)
      }
    }, 1500)
  }, [persistUpdate])

  const createDemo = useCallback(async (title: string, lessons: Lesson[]): Promise<Demo | null> => {
    if (!vacancyId) return null
    setSaveStatus("saving")
    try {
      const res = await fetch("/api/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vacancy_id: vacancyId, title, lessons_json: lessons }),
      })
      if (!res.ok) throw new Error("create failed")
      const json = await res.json()
      const row = (json.data ?? json) as ApiDemo
      const d = apiDemoToDemo(row)
      setDemo(d)
      latestDemoRef.current = d
      setSaveStatus("saved")
      return d
    } catch {
      setSaveStatus("error")
      return null
    }
  }, [vacancyId])

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return { demo, loading, error, saveStatus, createDemo, updateDemo }
}
