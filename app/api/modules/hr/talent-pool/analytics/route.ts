// Резерв → Аналитика: реальные метрики пула из кандидатов (стадия talent_pool)
// + ручных записей (talent_pool_entries). Read-only. Пустой пул → нули (честно).
import { NextResponse } from "next/server"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { candidates, vacancies, talentPoolEntries, referralLinks } from "@/lib/db/schema"
import { requireCompany } from "@/lib/api-helpers"
import { scoreToStatus as statusFromScore } from "@/lib/talent-pool/score-status"

const PALETTE = ["#6366f1", "#06b6d4", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899"]
const BAR_COLORS = ["bg-amber-500", "bg-cyan-500", "bg-emerald-500", "bg-indigo-500", "bg-red-500", "bg-purple-500"]
const MONTHS_RU = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]

type Member = { source: string; score: number; createdAt: Date | null; status: string }

export async function GET() {
  try {
    const user = await requireCompany()

    // Кандидаты из откликов в резерве (стадия talent_pool).
    const cand = await db
      .select({
        source: candidates.source, aiScore: candidates.aiScore,
        resumeScore: candidates.resumeScore, score: candidates.score,
        createdAt: candidates.createdAt,
      })
      .from(candidates)
      .innerJoin(vacancies, eq(candidates.vacancyId, vacancies.id))
      .where(and(eq(vacancies.companyId, user.companyId), eq(candidates.stage, "talent_pool"), isNull(vacancies.deletedAt)))

    // Ручные/CSV записи.
    const entries = await db.select({
      source: talentPoolEntries.source, score: talentPoolEntries.score,
      status: talentPoolEntries.status, createdAt: talentPoolEntries.createdAt,
    }).from(talentPoolEntries).where(eq(talentPoolEntries.companyId, user.companyId))

    const pool: Member[] = [
      ...cand.map(c => {
        const sc = c.aiScore ?? c.resumeScore ?? c.score ?? 0
        return { source: c.source || "—", score: sc, createdAt: c.createdAt, status: statusFromScore(sc) }
      }),
      ...entries.map(e => ({ source: e.source || "—", score: e.score, createdAt: e.createdAt, status: e.status || statusFromScore(e.score) })),
    ]

    const now = new Date()
    const total = pool.length
    const monthAgo = new Date(now.getTime() - 30 * 86400000)
    const newThisMonth = pool.filter(m => m.createdAt && new Date(m.createdAt) >= monthAgo).length

    // Нанятые рефералы — реальный сигнал найма из реф-программы.
    const refs = await db.select({ hired: referralLinks.hiredCount })
      .from(referralLinks).where(eq(referralLinks.companyId, user.companyId))
    const hired = refs.reduce((s, r) => s + (r.hired ?? 0), 0)
    const conversion = total + hired > 0 ? Math.round((hired / (total + hired)) * 100) : 0

    const avgDays = total > 0
      ? Math.round(pool.reduce((s, m) => s + (m.createdAt ? (now.getTime() - new Date(m.createdAt).getTime()) / 86400000 : 0), 0) / total)
      : 0

    // Источники: счётчики + проценты.
    const bySource = new Map<string, { count: number; scoreSum: number }>()
    for (const m of pool) {
      const cur = bySource.get(m.source) ?? { count: 0, scoreSum: 0 }
      cur.count++; cur.scoreSum += m.score; bySource.set(m.source, cur)
    }
    const sourcesArr = [...bySource.entries()].sort((a, b) => b[1].count - a[1].count)
    const sources = sourcesArr.map(([name, v], i) => ({
      name, value: total > 0 ? Math.round((v.count / total) * 100) : 0, color: PALETTE[i % PALETTE.length],
    }))
    const scoringBySource = sourcesArr.slice(0, 6).map(([source, v], i) => ({
      source, score: v.count > 0 ? Math.round(v.scoreSum / v.count) : 0, color: BAR_COLORS[i % BAR_COLORS.length],
    }))

    // Динамика за 6 месяцев — добавлено по месяцам.
    const dynamics: Array<{ month: string; added: number; hired: number; lost: number }> = []
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1)
      const next = new Date(now.getFullYear(), now.getMonth() - k + 1, 1)
      const added = pool.filter(m => m.createdAt && new Date(m.createdAt) >= d && new Date(m.createdAt) < next).length
      dynamics.push({ month: MONTHS_RU[d.getMonth()], added, hired: 0, lost: 0 })
    }

    // Воронка прогрева — из статусов.
    const cnt = (pred: (s: string) => boolean) => pool.filter(m => pred(m.status)).length
    const warming = cnt(s => s === "warming" || s === "hot" || s === "ideal")
    const interested = cnt(s => s === "hot" || s === "ideal")
    const ready = cnt(s => s === "ideal")
    const pct = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : "0%"
    const funnel = [
      { stage: "В пуле", count: total, pct: "100%" },
      { stage: "В прогреве", count: warming, pct: pct(warming) },
      { stage: "Заинтересован", count: interested, pct: pct(interested) },
      { stage: "Готов к найму", count: ready, pct: pct(ready) },
      { stage: "Нанято (рефералы)", count: hired, pct: total + hired > 0 ? `${conversion}%` : "0%" },
    ]

    return NextResponse.json({
      kpi: { pool: total, newThisMonth, conversion, avgDays },
      sources, scoringBySource, dynamics, funnel,
    })
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
