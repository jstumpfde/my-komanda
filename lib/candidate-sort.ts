import type { Candidate } from "@/components/dashboard/candidate-card"

export type CandidateSortMode = "date_desc" | "date_asc" | "demo_progress" | "ai_score" | "favorite"

function timestampOf(c: Candidate): number {
  if (c.createdAt) {
    const d = c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt)
    const t = d.getTime()
    if (!Number.isNaN(t)) return t
  }
  if (c.addedAt) {
    const t = c.addedAt instanceof Date ? c.addedAt.getTime() : new Date(c.addedAt as unknown as string).getTime()
    if (!Number.isNaN(t)) return t
  }
  return 0
}

function demoProgressOf(c: Candidate): number {
  const dp = c.demoProgressJson
  if (!dp || !Array.isArray(dp.blocks)) return -1
  const total = dp.totalBlocks ?? dp.blocks.length
  if (total <= 0) return -1
  const completed = dp.blocks.filter(b => b?.status === "completed").length
  return completed / total
}

export function applySortMode(list: Candidate[], mode: CandidateSortMode): Candidate[] {
  const arr = [...list]
  switch (mode) {
    case "date_desc":
      return arr.sort((a, b) => timestampOf(b) - timestampOf(a))
    case "date_asc":
      return arr.sort((a, b) => timestampOf(a) - timestampOf(b))
    case "demo_progress":
      return arr.sort((a, b) => {
        const da = demoProgressOf(a)
        const db = demoProgressOf(b)
        if (db !== da) return db - da
        return timestampOf(b) - timestampOf(a)
      })
    case "ai_score":
      return arr.sort((a, b) => {
        const sa = a.aiScore ?? -1
        const sb = b.aiScore ?? -1
        if (sb !== sa) return sb - sa
        return timestampOf(b) - timestampOf(a)
      })
    case "favorite":
      return arr.sort((a, b) => {
        const fa = a.isFavorite ? 1 : 0
        const fb = b.isFavorite ? 1 : 0
        if (fb !== fa) return fb - fa
        return timestampOf(b) - timestampOf(a)
      })
    default:
      return arr
  }
}
