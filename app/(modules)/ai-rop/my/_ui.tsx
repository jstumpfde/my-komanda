/**
 * Презентационные (не интерактивные) кусочки «Моего кабинета» — без "use client",
 * можно рендерить прямо из page.tsx (server component). Интерактив (кнопки/фетчи)
 * живёт в _client.tsx.
 */
import Link from "next/link"
import { Award, ExternalLink, PhoneOff, Target, Trophy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"
import { normalizePhone } from "@/lib/ai-rop/pii-mask"
import { formatDateShort } from "../_components/format"
import type { Achievement, LeaderRow } from "@/lib/ai-rop/gamification"

// ─── KPI-плашка (streak / challenge) ────────────────────────────────────────

export function KpiTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
}) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}

// ─── Челлендж недели (KPI-плашка с прогресс-баром) ──────────────────────────

export function WeeklyChallengeTile({
  goal,
  current,
  pct,
}: {
  goal: number
  current: number
  pct: number
}) {
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Target className="size-4 text-violet-600" />
          Цель недели
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{current} / {goal}</span>
          <span className="text-xs text-muted-foreground">звонков</span>
        </div>
        <Progress value={pct} className="mt-2 h-1.5" />
        <div className="mt-1 text-xs text-muted-foreground">{pct.toFixed(0)}% выполнено командой за неделю</div>
      </CardContent>
    </Card>
  )
}

// ─── Расхождения: бейдж критичности ─────────────────────────────────────────

export function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "high") {
    return (
      <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400">
        Высокая
      </Badge>
    )
  }
  if (severity === "medium") {
    return (
      <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
        Средняя
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Низкая
    </Badge>
  )
}

// ─── Оборванные нити ─────────────────────────────────────────────────────────

export interface LooseThreadRow {
  call_id: string
  client_phone: string | null
  started_at: string
  next_action: string | null
  summary: string | null
}

export function LooseThreadsCard({ rows }: { rows: LooseThreadRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <PhoneOff className="size-4 text-violet-600" />
          Оборванные нити
        </CardTitle>
        <CardDescription>
          Звонки без назначенного следующего шага за последние 30 дней
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет оборванных нитей — отличная работа!</p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => {
              const phone = row.client_phone ? normalizePhone(row.client_phone) : null
              const content = (
                <div className="flex flex-col gap-1 rounded-md border border-border/60 p-3 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{row.client_phone || "Без номера"}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatDateShort(row.started_at)}</span>
                  </div>
                  {row.summary && (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{row.summary}</p>
                  )}
                </div>
              )
              return phone ? (
                <Link key={row.call_id} href={`/ai-rop/clients/${phone}`} className="block">
                  {content}
                </Link>
              ) : (
                <div key={row.call_id}>{content}</div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Достижения ──────────────────────────────────────────────────────────────

export function AchievementsCard({ achievements }: { achievements: Achievement[] }) {
  const earnedCount = achievements.filter((a) => a.earned).length
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Award className="size-4 text-violet-600" />
          Достижения
        </CardTitle>
        <CardDescription>{earnedCount} из {achievements.length} выполнено</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {achievements.map((a) => (
            <div
              key={a.id}
              className={cn(
                "rounded-md border p-3",
                a.earned
                  ? "border-violet-500/30 bg-violet-500/10"
                  : "border-border/60 bg-muted/30",
              )}
            >
              <div className="flex items-center gap-2">
                <Award className={cn("size-3.5 shrink-0", a.earned ? "text-violet-600" : "text-muted-foreground")} />
                <span className={cn("text-sm font-medium", !a.earned && "text-muted-foreground")}>{a.title}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{a.description}</p>
              {!a.earned && a.progress !== undefined && a.progress > 0 && (
                <Progress value={a.progress * 100} className="mt-2 h-1.5" />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Лидерборд ──────────────────────────────────────────────────────────────

export function LeaderboardCard({ leaders }: { leaders: LeaderRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Trophy className="size-4 text-violet-600" />
          Лидерборд (30 дней)
        </CardTitle>
        <CardDescription>
          Имена коллег скрыты — видно только ваше место
        </CardDescription>
      </CardHeader>
      <CardContent>
        {leaders.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока недостаточно данных за 30 дней.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs font-semibold text-muted-foreground">
                  <th className="w-12 py-2 font-semibold">#</th>
                  <th className="py-2 font-semibold">Менеджер</th>
                  <th className="py-2 text-right font-semibold">Звонков</th>
                  <th className="py-2 text-right font-semibold">Ср. оценка</th>
                  <th className="py-2 text-right font-semibold">Score</th>
                </tr>
              </thead>
              <tbody>
                {leaders.map((l) => (
                  <tr
                    key={l.manager_id}
                    className={cn(
                      "border-b border-border/50 last:border-0",
                      l.is_me && "bg-primary/5 font-medium",
                    )}
                  >
                    <td className="py-2 font-semibold">{l.rank}</td>
                    <td className="py-2">
                      {l.manager_name}
                      {l.is_me && <span className="text-muted-foreground"> (вы)</span>}
                    </td>
                    <td className="py-2 text-right tabular-nums">{l.done_count}</td>
                    <td className="py-2 text-right tabular-nums">{l.avg_score != null ? l.avg_score.toFixed(1) : "—"}</td>
                    <td className="py-2 text-right tabular-nums text-primary">{l.score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Гейт «не привязан как менеджер» ────────────────────────────────────────

export function NotLinkedGate({ showRopLink }: { showRopLink: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <PhoneOff className="size-8 text-muted-foreground" />
        <p className="max-w-md text-sm text-muted-foreground">
          Вы не привязаны как менеджер в AI-РОП. Обратитесь к руководителю, чтобы вас
          привязали в настройках модуля.
        </p>
        {showRopLink && (
          <Link
            href="/ai-rop/rop"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Перейти в кабинет РОПа <ExternalLink className="size-3.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
