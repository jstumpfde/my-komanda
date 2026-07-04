"use client"

import { BarChart3 } from "lucide-react"

export interface ChannelAnalyticsRow {
  chatId: string | null
  chatTitle: string
  postsSent: number
  clicks: number
  leads: number
  costPerPost: number | null
  spend: number | null
  cpl: number | null
}

function formatMoney(v: number | null): string {
  if (v == null) return "—"
  return `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`
}

interface Props {
  rows: ChannelAnalyticsRow[]
  totals: { postsSent: number; clicks: number; leads: number; spend: number; cpl: number | null }
  loading: boolean
}

export function TelegramAnalyticsSection({ rows, totals, loading }: Props) {
  return (
    <div className="rounded-xl border border-border shadow-sm bg-card">
      <div className="p-4 border-b border-border flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-violet-600" />
        <h2 className="text-sm font-semibold">Аналитика по каналам</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="px-4 py-2.5 font-medium">Канал</th>
              <th className="px-4 py-2.5 font-medium text-right">Постов</th>
              <th className="px-4 py-2.5 font-medium text-right">Кликов</th>
              <th className="px-4 py-2.5 font-medium text-right">Лидов</th>
              <th className="px-4 py-2.5 font-medium text-right">Расход</th>
              <th className="px-4 py-2.5 font-medium text-right">CPL</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Загрузка…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Данных пока нет.</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.chatId ?? "none"} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2.5 font-medium max-w-[280px] truncate" title={r.chatTitle}>{r.chatTitle}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.postsSent}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.clicks}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">{r.leads}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(r.spend)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(r.cpl)}</td>
              </tr>
            ))}
          </tbody>
          {!loading && rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-border font-semibold bg-muted/30">
                <td className="px-4 py-2.5">Итого</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totals.postsSent}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totals.clicks}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{totals.leads}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(totals.spend)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(totals.cpl)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
