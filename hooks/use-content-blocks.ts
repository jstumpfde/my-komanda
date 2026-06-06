"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { Lesson } from "@/lib/course-types"

export type ContentType = "presentation" | "test" | "task"

export interface ContentBlock {
  id: string
  vacancyId: string
  kind: string
  contentType: ContentType
  title: string
  status: "draft" | "published"
  lessons: Lesson[]
  sortOrder: number
  createdAt: string
  updatedAt: string
}

interface ApiContentBlock {
  id: string
  vacancyId: string
  kind: string
  contentType: string
  title: string
  status: string
  lessonsJson: Lesson[]
  sortOrder: number
  createdAt: string
  updatedAt: string
}

function apiBlockToBlock(d: ApiContentBlock): ContentBlock {
  const ct = d.contentType === "test" || d.contentType === "task" ? d.contentType : "presentation"
  return {
    id: d.id,
    vacancyId: d.vacancyId,
    kind: d.kind,
    contentType: ct as ContentType,
    title: d.title,
    status: (d.status === "published" ? "published" : "draft") as "draft" | "published",
    lessons: d.lessonsJson ?? [],
    sortOrder: d.sortOrder ?? 0,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }
}

export type BlockPatch = {
  title?: string
  contentType?: ContentType
  lessons?: Lesson[]
  status?: "draft" | "published"
}

interface UseContentBlocksResult {
  blocks: ContentBlock[]
  loading: boolean
  error: string | null
  createBlock: (contentType: ContentType, title: string) => Promise<ContentBlock | null>
  updateBlock: (id: string, patch: BlockPatch) => void
  deleteBlock: (id: string) => Promise<boolean>
  reorder: (idsInOrder: string[]) => Promise<void>
}

export function useContentBlocks(vacancyId: string | null): UseContentBlocksResult {
  const [blocks, setBlocks] = useState<ContentBlock[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Дебаунс-рефы для каждого блока (по id)
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const pendingPatches = useRef<Record<string, BlockPatch>>({})

  const load = useCallback(async () => {
    if (!vacancyId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/modules/hr/demos?vacancy_id=${encodeURIComponent(vacancyId)}&list=1`
      )
      if (!res.ok) throw new Error("load failed")
      const json = await res.json() as { data?: ApiContentBlock[] } | ApiContentBlock[]
      const rows: ApiContentBlock[] = (json as { data?: ApiContentBlock[] }).data
        ?? (json as ApiContentBlock[])
      if (Array.isArray(rows)) {
        // Показываем ВСЕ блоки вакансии, включая легаси kind='demo'/'test'
        // (они = первые блоки списка для преемственности). Рантайм по-прежнему
        // читает легаси-записи по kind — правка их здесь это поведение сохраняет.
        setBlocks(rows.map(apiBlockToBlock))
      }
    } catch {
      setError("Не удалось загрузить блоки контента")
    } finally {
      setLoading(false)
    }
  }, [vacancyId])

  useEffect(() => {
    load()
  }, [load])

  const persistUpdate = useCallback(async (id: string, patch: BlockPatch) => {
    const body: Record<string, unknown> = {}
    if (patch.title !== undefined) body.title = patch.title
    if (patch.contentType !== undefined) body.content_type = patch.contentType
    if (patch.lessons !== undefined) body.lessons_json = patch.lessons
    if (patch.status !== undefined) body.status = patch.status
    try {
      const res = await fetch(`/api/modules/hr/demos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error("save failed")
    } catch {
      // silent — оптимистичный апдейт уже применён в state
    }
  }, [])

  const createBlock = useCallback(async (
    contentType: ContentType,
    title: string
  ): Promise<ContentBlock | null> => {
    if (!vacancyId) return null
    try {
      const res = await fetch("/api/modules/hr/demos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vacancy_id: vacancyId,
          title,
          content_type: contentType,
          // kind не передаём — API сгенерирует 'block:<uuid>'
        }),
      })
      if (!res.ok) throw new Error("create failed")
      const json = await res.json() as { data?: ApiContentBlock } | ApiContentBlock
      const row = ((json as { data?: ApiContentBlock }).data ?? json) as ApiContentBlock
      const block = apiBlockToBlock(row)
      setBlocks(prev => [...prev, block])
      return block
    } catch {
      return null
    }
  }, [vacancyId])

  const updateBlock = useCallback((id: string, patch: BlockPatch) => {
    // Оптимистичный апдейт
    setBlocks(prev => prev.map(b => {
      if (b.id !== id) return b
      return {
        ...b,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.contentType !== undefined ? { contentType: patch.contentType } : {}),
        ...(patch.lessons !== undefined ? { lessons: patch.lessons } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      }
    }))

    // Накапливаем патч
    pendingPatches.current[id] = { ...pendingPatches.current[id], ...patch }

    // lessons — дебаунс 700мс, остальное — сразу
    const hasLessonsOnly = patch.lessons !== undefined &&
      Object.keys(patch).every(k => k === "lessons")

    if (hasLessonsOnly) {
      if (debounceRefs.current[id]) clearTimeout(debounceRefs.current[id])
      debounceRefs.current[id] = setTimeout(() => {
        const accumulated = pendingPatches.current[id]
        if (accumulated) {
          delete pendingPatches.current[id]
          persistUpdate(id, accumulated)
        }
      }, 700)
    } else {
      // title/contentType/status — сохраняем немедленно (flush накопленный + новый)
      if (debounceRefs.current[id]) clearTimeout(debounceRefs.current[id])
      const accumulated = pendingPatches.current[id]
      if (accumulated) {
        delete pendingPatches.current[id]
        persistUpdate(id, accumulated)
      }
    }
  }, [persistUpdate])

  const deleteBlock = useCallback(async (id: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/modules/hr/demos/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("delete failed")
      setBlocks(prev => prev.filter(b => b.id !== id))
      return true
    } catch {
      return false
    }
  }, [])

  const reorder = useCallback(async (idsInOrder: string[]) => {
    // Оптимистичный апдейт sort_order
    setBlocks(prev => {
      const byId = new Map(prev.map(b => [b.id, b]))
      return idsInOrder.map((id, i) => {
        const b = byId.get(id)
        return b ? { ...b, sortOrder: i } : null
      }).filter((b): b is ContentBlock => b !== null)
    })

    // Сохраняем на сервере только изменившиеся
    const currentOrder = blocks.map(b => b.id)
    const changed = idsInOrder
      .map((id, i) => ({ id, newOrder: i, oldOrder: currentOrder.indexOf(id) }))
      .filter(({ newOrder, oldOrder }) => newOrder !== oldOrder)

    await Promise.all(
      changed.map(({ id, newOrder }) =>
        fetch(`/api/modules/hr/demos/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: newOrder }),
        }).catch(() => {})
      )
    )
  }, [blocks])

  return { blocks, loading, error, createBlock, updateBlock, deleteBlock, reorder }
}
