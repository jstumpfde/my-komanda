/**
 * Геймификация AI-РОП — порт call-agent lib/gamification.ts (§5.4 MASTER-TZ).
 *
 * Что измеряем:
 *   - leaderboard: топ-N менеджеров за период с формулой score = avg_manager_score * 10 + done_count + positive_share * 20
 *   - streaks: подряд дней с ≥ 1 done-звонком и средним score ≥ 6.0
 *   - achievements: статические бэйджи (первые звонки, неделя со средней 8+, серии, и т.д.)
 *   - weekly challenge: целевое число done-звонков за неделю на тенант
 *
 * Принцип ТЗ: «завязывать на качество, а не только на количество — чтобы не
 * провоцировать накрутку». Поэтому в score не COUNT(*), а смесь количества и
 * средней оценки.
 */
import { sql, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { ropSettings } from "@/lib/db/schema"

export interface LeaderRow {
  rank: number
  manager_id: string
  manager_name: string
  done_count: number
  avg_score: number | null
  avg_compliance: number | null
  positive_share: number     // 0..1
  score: number               // итоговый рейтинг
  is_me?: boolean
}

export interface ManagerStreak {
  current_streak: number      // подряд дней с good day
  longest_streak: number      // рекорд за всё время
  last_active_date: string | null
}

export interface Achievement {
  id: string
  title: string
  description: string
  earned: boolean
  progress?: number           // 0..1 если не достигнуто
  earnedAt?: string
}

export interface WeeklyChallenge {
  goal: number
  current: number
  weekStart: string
  pct: number
}

const GOOD_SCORE = 6.0
const DEFAULT_WEEKLY_GOAL = 50

// ───────── Leaderboard ─────────

/**
 * Лидерборд за последние 30 дней.
 * Формула: score = avg_score * 10 + done_count + positive_share * 20
 * — позволяет хорошему стабильному менеджеру обогнать «много звонков но низкая оценка».
 */
export async function getLeaderboard(opts: {
  tenantId: string
  myManagerId?: string | null    // чтобы пометить is_me
  anonymize?: boolean            // true для роли manager — заменяем имена на «Менеджер #N»
  daysBack?: number
}): Promise<LeaderRow[]> {
  const days = opts.daysBack ?? 30

  const rows = (await db.execute(sql`
    SELECT
      c.manager_id AS manager_id,
      MAX(COALESCE(c.manager_name, '')) AS manager_name,
      SUM(CASE WHEN c.status = 'done' THEN 1 ELSE 0 END)::int AS done_count,
      AVG(a.manager_score)::float8 AS avg_score,
      AVG(a.script_compliance)::float8 AS avg_compliance,
      SUM(CASE WHEN a.sentiment = 'positive' THEN 1 ELSE 0 END)::int AS positive,
      COUNT(a.call_id)::int AS analysed_count
    FROM rop_calls c
    LEFT JOIN rop_analyses a ON a.call_id = c.id
    WHERE c.tenant_id = ${opts.tenantId}::uuid
      AND c.manager_id IS NOT NULL AND c.manager_id <> ''
      AND NOT EXISTS (
        SELECT 1 FROM rop_managers mx
        WHERE mx.tenant_id = c.tenant_id AND mx.bitrix_manager_id = c.manager_id AND mx.excluded_from_reports = true
      )
      AND substr(c.started_at::text, 1, 10) >= (CURRENT_DATE - (${days}::int) * INTERVAL '1 day')::text
    GROUP BY c.manager_id
    HAVING SUM(CASE WHEN c.status = 'done' THEN 1 ELSE 0 END) >= 3
  `)) as unknown as Array<{
    manager_id: string; manager_name: string
    done_count: number; avg_score: number | null; avg_compliance: number | null
    positive: number; analysed_count: number
  }>

  const scored = rows.map((r) => {
    const positiveShare = r.analysed_count > 0 ? Number(r.positive) / Number(r.analysed_count) : 0
    const score = (Number(r.avg_score ?? 0) * 10) + Number(r.done_count) + positiveShare * 20
    return {
      manager_id: r.manager_id,
      manager_name: r.manager_name || `ID ${r.manager_id}`,
      done_count: Number(r.done_count),
      avg_score: r.avg_score != null ? Number(r.avg_score) : null,
      avg_compliance: r.avg_compliance != null ? Number(r.avg_compliance) : null,
      positive_share: positiveShare,
      score: Math.round(score * 10) / 10,
    }
  }).sort((a, b) => b.score - a.score)

  return scored.map((r, idx) => ({
    rank: idx + 1,
    manager_id: r.manager_id,
    manager_name: opts.anonymize && r.manager_id !== opts.myManagerId
      ? `Менеджер #${idx + 1}`
      : r.manager_name,
    done_count: r.done_count,
    avg_score: r.avg_score,
    avg_compliance: r.avg_compliance,
    positive_share: r.positive_share,
    score: r.score,
    is_me: r.manager_id === opts.myManagerId,
  }))
}

// ───────── Streaks ─────────

/**
 * Подряд дней с good day (≥1 done-звонок И средняя оценка ≥ 6).
 * Считаем за последние 90 дней — достаточно для UI.
 */
export async function getManagerStreak(opts: {
  tenantId: string
  bitrixManagerId: string
}): Promise<ManagerStreak> {
  const rows = (await db.execute(sql`
    SELECT substr(c.started_at::text, 1, 10) AS day,
           SUM(CASE WHEN c.status='done' THEN 1 ELSE 0 END)::int AS done_count,
           AVG(a.manager_score)::float8 AS avg_score
    FROM rop_calls c
    LEFT JOIN rop_analyses a ON a.call_id = c.id
    WHERE c.tenant_id = ${opts.tenantId}::uuid AND c.manager_id = ${opts.bitrixManagerId}
      AND substr(c.started_at::text, 1, 10) >= (CURRENT_DATE - INTERVAL '90 day')::text
    GROUP BY day
    ORDER BY day DESC
  `)) as unknown as Array<{ day: string; done_count: number; avg_score: number | null }>

  // Хорошие дни — список ISO YYYY-MM-DD
  const goodDays = new Set(
    rows
      .filter((r) => Number(r.done_count) > 0 && (r.avg_score == null || Number(r.avg_score) >= GOOD_SCORE))
      .map((r) => r.day)
  )

  // Текущий streak — считаем подряд хороших дней начиная с СЕГОДНЯ или ВЧЕРА (выходные допустимы — берём последний day из rows)
  const today = new Date().toISOString().slice(0, 10)
  let current = 0
  const d = new Date()
  while (true) {
    const iso = d.toISOString().slice(0, 10)
    if (goodDays.has(iso)) {
      current++
      d.setDate(d.getDate() - 1)
    } else if (current === 0 && iso === today) {
      // Сегодня ещё нет звонков — это норма, начинаем со вчера
      d.setDate(d.getDate() - 1)
    } else {
      break
    }
    if (current > 90) break // safety
  }

  // Рекорд — самый длинный непрерывный отрезок
  const sortedDays = Array.from(goodDays).sort()
  let longest = 0, run = 0, prev: Date | null = null
  for (const iso of sortedDays) {
    const cur = new Date(iso)
    if (prev) {
      const diff = (cur.getTime() - prev.getTime()) / 86400000
      if (diff === 1) run++; else run = 1
    } else run = 1
    if (run > longest) longest = run
    prev = cur
  }

  return {
    current_streak: current,
    longest_streak: longest,
    last_active_date: rows[0]?.day ?? null,
  }
}

// ───────── Achievements ─────────

interface AchievementRule {
  id: string
  title: string
  description: string
  check: (stats: ManagerStats) => boolean
  progress?: (stats: ManagerStats) => number
}

interface ManagerStats {
  done_count_total: number
  done_count_last_week: number
  avg_score_total: number | null
  avg_score_last_week: number | null
  positive_count: number
  current_streak: number
  longest_streak: number
}

const ACHIEVEMENTS: AchievementRule[] = [
  {
    id: "first_blood",
    title: "Первый разбор",
    description: "Один проанализированный звонок — добро пожаловать!",
    check: (s) => s.done_count_total >= 1,
  },
  {
    id: "ten_calls",
    title: "Десятка",
    description: "10 проанализированных звонков",
    check: (s) => s.done_count_total >= 10,
    progress: (s) => Math.min(1, s.done_count_total / 10),
  },
  {
    id: "hundred_calls",
    title: "Сотник",
    description: "100 проанализированных звонков",
    check: (s) => s.done_count_total >= 100,
    progress: (s) => Math.min(1, s.done_count_total / 100),
  },
  {
    id: "first_positive",
    title: "Тёплый звонок",
    description: "Первый разговор с позитивным настроением заказчика",
    check: (s) => s.positive_count >= 1,
  },
  {
    id: "good_week",
    title: "Хорошая неделя",
    description: "Средняя оценка за последнюю неделю ≥ 8.0",
    check: (s) => (s.avg_score_last_week ?? 0) >= 8.0,
  },
  {
    id: "five_day_streak",
    title: "Серия 5",
    description: "5 дней подряд с хорошим средним",
    check: (s) => s.current_streak >= 5 || s.longest_streak >= 5,
    progress: (s) => Math.min(1, Math.max(s.current_streak, s.longest_streak) / 5),
  },
  {
    id: "month_streak",
    title: "Серия 30",
    description: "30 дней подряд с хорошим средним",
    check: (s) => s.current_streak >= 30 || s.longest_streak >= 30,
    progress: (s) => Math.min(1, Math.max(s.current_streak, s.longest_streak) / 30),
  },
  {
    id: "consistent_pro",
    title: "Стабильный профи",
    description: "Средняя за всё время ≥ 7.5 при 50+ звонках",
    check: (s) => (s.avg_score_total ?? 0) >= 7.5 && s.done_count_total >= 50,
  },
]

export async function getAchievementsFor(opts: {
  tenantId: string
  bitrixManagerId: string
}): Promise<Achievement[]> {
  const aggsRows = (await db.execute(sql`
    SELECT
      SUM(CASE WHEN c.status='done' THEN 1 ELSE 0 END)::int AS done_total,
      SUM(CASE WHEN c.status='done' AND substr(c.started_at::text,1,10) >= (CURRENT_DATE - INTERVAL '7 day')::text THEN 1 ELSE 0 END)::int AS done_week,
      AVG(a.manager_score)::float8 AS avg_total,
      AVG(CASE WHEN substr(c.started_at::text,1,10) >= (CURRENT_DATE - INTERVAL '7 day')::text THEN a.manager_score END)::float8 AS avg_week,
      SUM(CASE WHEN a.sentiment='positive' THEN 1 ELSE 0 END)::int AS positive_count
    FROM rop_calls c
    LEFT JOIN rop_analyses a ON a.call_id = c.id
    WHERE c.tenant_id = ${opts.tenantId}::uuid AND c.manager_id = ${opts.bitrixManagerId}
  `)) as unknown as Array<{
    done_total: number; done_week: number
    avg_total: number | null; avg_week: number | null
    positive_count: number
  }>
  const aggs = aggsRows[0]

  const streak = await getManagerStreak(opts)

  const stats: ManagerStats = {
    done_count_total: Number(aggs?.done_total ?? 0),
    done_count_last_week: Number(aggs?.done_week ?? 0),
    avg_score_total: aggs?.avg_total != null ? Number(aggs.avg_total) : null,
    avg_score_last_week: aggs?.avg_week != null ? Number(aggs.avg_week) : null,
    positive_count: Number(aggs?.positive_count ?? 0),
    current_streak: streak.current_streak,
    longest_streak: streak.longest_streak,
  }

  return ACHIEVEMENTS.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    earned: r.check(stats),
    progress: r.progress ? r.progress(stats) : (r.check(stats) ? 1 : 0),
  }))
}

// ───────── Weekly Challenge ─────────

/**
 * Текущий weekly challenge тенанта.
 * Цель из rop_settings.settings.weeklyDoneGoal (default 50) — в оригинале
 * лежала в tenants.settings.weekly_done_goal, здесь — per-company rop_settings.
 * Прогресс — done звонки с понедельника текущей недели.
 */
export async function getWeeklyChallenge(opts: { tenantId: string }): Promise<WeeklyChallenge> {
  const [settingsRow] = await db
    .select({ settings: ropSettings.settings })
    .from(ropSettings)
    .where(eq(ropSettings.companyId, opts.tenantId))
    .limit(1)
  const rawGoal = (settingsRow?.settings as Record<string, unknown> | null)?.weeklyDoneGoal
  const parsedGoal = typeof rawGoal === "number" ? rawGoal : parseInt(String(rawGoal ?? ""), 10)
  const goal = Number.isFinite(parsedGoal) && parsedGoal > 0 ? parsedGoal : DEFAULT_WEEKLY_GOAL

  // Понедельник текущей недели
  const now = new Date()
  const dow = (now.getDay() + 6) % 7 // Mon=0..Sun=6
  const mon = new Date(now)
  mon.setDate(mon.getDate() - dow)
  mon.setHours(0, 0, 0, 0)
  const weekStart = mon.toISOString().slice(0, 10)

  const rows = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM rop_calls
    WHERE tenant_id = ${opts.tenantId}::uuid AND status = 'done'
      AND substr(started_at::text, 1, 10) >= ${weekStart}
  `)) as unknown as Array<{ n: number }>

  const current = Number(rows[0]?.n ?? 0)
  return {
    goal,
    current,
    weekStart,
    pct: goal > 0 ? Math.min(100, (current / goal) * 100) : 0,
  }
}
