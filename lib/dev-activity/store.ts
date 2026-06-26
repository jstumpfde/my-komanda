// Оркестратор: собрать → дедупнуть коммиты по SHA → разобрать новые дни через
// Claude → записать в dev_activity_days → пересчитать норму/вердикты по всему
// ряду. Ресуммаризируем только изменившиеся дни (по отпечатку списка SHA),
// чтобы не жечь токены на каждый запуск.

import { eq, and, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { devActivityDays } from "@/lib/db/schema"
import { collect } from "./collect"
import { summarizeDay, type CommitForSummary } from "./summarize"
import { computeSeries, scoreTasks } from "./scoring"
import { PERSON, WINDOW_DAYS } from "./config"
import type {
  DevActivityDay, DayTask, RepoDayStat, Substance, Verdict, CollectResult, RecentCommit,
} from "./types"

// Окно ленты «что катит сейчас».
const RECENT_HOURS = 48

// Текущая дата в МСК (UTC+3, без перехода на летнее время).
function mskToday(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
}
function mskDayOffset(deltaDays: number): string {
  return new Date(Date.now() + 3 * 3600_000 + deltaDays * 86_400_000).toISOString().slice(0, 10)
}

interface DedupCommit { repo: string; sha: string; at: string; subject: string; added: number; removed: number }

// Сводит сырьё сбора к коммитам по дням, дедуплицируя по SHA (staging и основной
// чекаут market-radar делят одну ветку — без дедупа было бы двойной счёт).
function dedupByDay(res: CollectResult): Map<string, DedupCommit[]> {
  const byDay = new Map<string, DedupCommit[]>()
  const seen = new Set<string>()   // sha, чтобы коммит учитывался один раз
  for (const repo of res.repos) {        // репо идут в порядке config (дев раньше staging)
    for (const c of repo.commits) {
      if (!c.sha || !c.day || seen.has(c.sha)) continue
      seen.add(c.sha)
      const list = byDay.get(c.day) ?? []
      list.push({ repo: repo.label, sha: c.sha, at: c.at, subject: c.subject, added: c.added, removed: c.removed })
      byDay.set(c.day, list)
    }
  }
  return byDay
}

function repoStats(commits: DedupCommit[]): RepoDayStat[] {
  const m = new Map<string, RepoDayStat>()
  for (const c of commits) {
    const s = m.get(c.repo) ?? { repo: c.repo, commits: 0, added: 0, removed: 0 }
    s.commits += 1; s.added += c.added; s.removed += c.removed
    m.set(c.repo, s)
  }
  return [...m.values()].sort((a, b) => b.commits - a.commits)
}

function fingerprint(commits: DedupCommit[]): string {
  return commits.map(c => c.sha).sort().join(",")
}

export interface CollectStoreResult {
  person:    string
  daysTotal: number
  resummarized: number
  reused:    number
}

export async function collectAndStore(): Promise<CollectStoreResult> {
  const res = await collect()
  const byDay = dedupByDay(res)
  const today = mskToday()

  // Дни, которым гарантируем строку: все дни с коммитами + последние WINDOW_DAYS.
  const days = new Set<string>(byDay.keys())
  for (let i = 0; i < WINDOW_DAYS; i++) days.add(mskDayOffset(-i))

  // Текущее состояние проектов (для панели «Проекты сейчас») — кладём в raw
  // сегодняшней строки.
  const repoStates = res.repos.map(r => ({
    label: r.label, branch: r.branch, wip: r.wipFiles, unpushed: r.unpushed, commits: r.commits.length,
  }))
  const wipTotal = res.repos.reduce((s, r) => s + r.wipFiles, 0)

  // Лента «что катит сейчас» — дедуплицированные коммиты за последние RECENT_HOURS,
  // по убыванию времени. Кладём в raw сегодняшней строки.
  const cutoff = Date.now() - RECENT_HOURS * 3600_000
  const recent: RecentCommit[] = [...byDay.values()].flat()
    .filter(c => c.at && new Date(c.at).getTime() >= cutoff)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 50)
    .map(c => ({ at: c.at, repo: c.repo, subject: c.subject, added: c.added, removed: c.removed }))

  let resummarized = 0, reused = 0

  for (const day of days) {
    const commits = byDay.get(day) ?? []
    const fp = fingerprint(commits)
    const stats = repoStats(commits)
    const commitCount  = commits.length
    const linesAdded   = commits.reduce((s, c) => s + c.added, 0)
    const linesRemoved = commits.reduce((s, c) => s + c.removed, 0)

    const [existing] = await db.select().from(devActivityDays)
      .where(and(eq(devActivityDays.person, PERSON), eq(devActivityDays.day, day))).limit(1)

    let tasks: DayTask[] = []
    let summary: string | null = null
    let taskCount = 0
    let substance: Substance | null = null

    if (commitCount > 0) {
      const rawFp = (existing?.raw as { fingerprint?: string } | null)?.fingerprint
      if (existing && existing.summary != null && rawFp === fp) {
        // Ничего не изменилось — переиспользуем разбор, экономим токены.
        tasks     = (existing.tasks as DayTask[] | null) ?? []
        summary   = existing.summary
        taskCount = existing.taskCount
        substance = (existing.substance as Substance | null) ?? null
        reused++
      } else {
        const forAi: CommitForSummary[] = commits.map(c => ({
          repo: c.repo, subject: c.subject, added: c.added, removed: c.removed,
        }))
        const s = await summarizeDay(day, forAi)
        tasks = s.tasks; summary = s.summary; taskCount = s.taskCount; substance = s.substance
        resummarized++
      }
    }

    const score = scoreTasks(tasks)
    const wipFiles = day === today ? wipTotal : 0
    const raw = day === today ? { fingerprint: fp, repoStates, recent } : { fingerprint: fp }

    const values = {
      person: PERSON, day, commitCount, linesAdded, linesRemoved, wipFiles,
      taskCount, score, substance, summary,
      tasks: tasks as unknown, repos: stats as unknown, raw: raw as unknown,
      updatedAt: new Date(),
    }
    await db.insert(devActivityDays).values(values as typeof devActivityDays.$inferInsert)
      .onConflictDoUpdate({
        target: [devActivityDays.person, devActivityDays.day],
        set: {
          commitCount, linesAdded, linesRemoved, wipFiles, taskCount, score,
          substance, summary, tasks: tasks as unknown, repos: stats as unknown,
          raw: raw as unknown, updatedAt: new Date(),
        },
      })
  }

  await recomputeVerdicts()
  return { person: PERSON, daysTotal: days.size, resummarized, reused }
}

// Пересчитывает baseline+verdict по всему ряду (норма зависит от истории).
export async function recomputeVerdicts(): Promise<void> {
  const rows = await db.select().from(devActivityDays)
    .where(eq(devActivityDays.person, PERSON)).orderBy(asc(devActivityDays.day))

  const series = computeSeries(rows.map(r => ({ day: r.day, score: r.score })))
  const byDay = new Map(series.map(s => [s.day, s]))

  for (const r of rows) {
    const v = byDay.get(r.day)
    if (!v) continue
    if (r.verdict === v.verdict && r.baseline === v.baseline) continue
    await db.update(devActivityDays)
      .set({ verdict: v.verdict, baseline: v.baseline })
      .where(eq(devActivityDays.id, r.id))
  }
}

export interface DevActivitySeries {
  person: string
  days:   DevActivityDay[]
  repoStates: Array<{ label: string; branch: string | null; wip: number; unpushed: number; commits: number }>
  recent: RecentCommit[]
  lastCollectedAt: string | null
}

// Чтение ряда для страницы (последние WINDOW_DAYS + дни с активностью).
export async function getSeries(): Promise<DevActivitySeries> {
  const rows = await db.select().from(devActivityDays)
    .where(eq(devActivityDays.person, PERSON)).orderBy(asc(devActivityDays.day))

  const today = mskToday()
  const todayRow = rows.find(r => r.day === today)
  const todayRaw = todayRow?.raw as { repoStates?: DevActivitySeries["repoStates"]; recent?: RecentCommit[] } | null
  const repoStates = todayRaw?.repoStates ?? []
  const recent = todayRaw?.recent ?? []

  const days: DevActivityDay[] = rows.map(r => ({
    day: r.day,
    commitCount: r.commitCount,
    linesAdded: r.linesAdded,
    linesRemoved: r.linesRemoved,
    wipFiles: r.wipFiles,
    taskCount: r.taskCount,
    score: r.score,
    substance: (r.substance as Substance | null) ?? null,
    verdict: (r.verdict as Verdict | null) ?? null,
    baseline: r.baseline,
    summary: r.summary,
    tasks: (r.tasks as DayTask[] | null) ?? [],
    repos: (r.repos as RepoDayStat[] | null) ?? [],
  }))

  const lastCollectedAt = todayRow?.collectedAt
    ? new Date(todayRow.collectedAt).toISOString()
    : (rows.length ? new Date(rows[rows.length - 1].updatedAt).toISOString() : null)

  return { person: PERSON, days, repoStates, recent, lastCollectedAt }
}
