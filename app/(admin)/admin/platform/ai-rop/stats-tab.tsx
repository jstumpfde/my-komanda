"use client"

// AI-РОП → Статистика: агрегат за 30 дней (звонки, активные компании, AI-расход, топ по расходу).

import { useEffect, useState } from "react"
import { Loader2, BarChart3 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"

interface StatsData {
  since: string
  callsProcessed: number
  callsTotal: number
  companiesActive: number
  aiCalls: number
  aiCostUsd: number
  topCompanies: { companyId: string; companyName: string; costUsd: number; calls: number }[]
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  )
}

export function StatsTab() {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/platform/ai-rop/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setData(j))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="w-4 h-4" /> За последние 30 дней</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Звонков обработано" value={data?.callsProcessed ?? 0} />
            <MetricCard label="Звонков импортировано" value={data?.callsTotal ?? 0} />
            <MetricCard label="Компаний активно" value={data?.companiesActive ?? 0} />
            <MetricCard label="AI-расход, $" value={(data?.aiCostUsd ?? 0).toFixed(2)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Топ компаний по AI-расходу</CardTitle></CardHeader>
        <CardContent>
          <TableCard>
            <DataTable>
              <DataHead>
                <DataHeadCell>Компания</DataHeadCell>
                <DataHeadCell align="right">AI-вызовов</DataHeadCell>
                <DataHeadCell align="right">Расход, $</DataHeadCell>
              </DataHead>
              <tbody>
                {(data?.topCompanies ?? []).map((c) => (
                  <DataRow key={c.companyId}>
                    <DataCell className="font-medium">{c.companyName}</DataCell>
                    <DataCell align="right" className="tabular-nums">{c.calls}</DataCell>
                    <DataCell align="right" className="tabular-nums">{c.costUsd.toFixed(4)}</DataCell>
                  </DataRow>
                ))}
                {(data?.topCompanies?.length ?? 0) === 0 && (
                  <DataRow><DataCell colSpan={3}><span className="text-muted-foreground">Данных пока нет</span></DataCell></DataRow>
                )}
              </tbody>
            </DataTable>
          </TableCard>
        </CardContent>
      </Card>
    </div>
  )
}
