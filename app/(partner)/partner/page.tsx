"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2, Users, Wallet, Percent, Building2 } from "lucide-react"

interface Overview {
  kind: string
  billingMode: string
  commissionPercent: number
  isOverride: boolean
  totalClients: number
  activeClients: number
  totalMrrRub: number
  totalEarningsRub: number
}
interface ClientRow {
  companyId: string
  name: string
  status: string | null
  subscriptionStatus: string | null
  planName: string | null
  mrrRub: number
  modules: { slug: string; name: string }[]
  commissionPercent: number
  earningsRub: number
}

const KIND_LABEL: Record<string, string> = {
  partner: "Партнёр",
  sub_partner: "Суб-партнёр",
  referral: "Реферал",
}
const SUB_LABEL: Record<string, string> = {
  active: "Активна",
  trial: "Триал",
  paused: "Пауза",
  cancelled: "Отменена",
  expired: "Истекла",
}

function rub(n: number): string {
  return n.toLocaleString("ru-RU") + " ₽"
}

export default function PartnerDashboardPage() {
  const [ov, setOv] = useState<Overview | null>(null)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    Promise.all([
      fetch("/api/partner/overview").then((r) => r.ok ? r.json() : Promise.reject(r)),
      fetch("/api/partner/clients").then((r) => r.ok ? r.json() : Promise.reject(r)),
    ])
      .then(([o, c]) => { setOv(o); setClients(c.clients ?? []) })
      .catch(() => setError("Не удалось загрузить данные кабинета"))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (error) {
    return <div className="p-6 text-sm text-destructive">{error}</div>
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">Партнёрский кабинет</h1>
          <p className="text-sm text-muted-foreground">Ваши клиенты и доход с платформы</p>
        </div>
        {ov && (
          <Badge variant="outline" className="text-xs">
            {KIND_LABEL[ov.kind] ?? ov.kind} · комиссия {ov.commissionPercent}% {ov.isOverride ? "(фикс)" : "(по объёму)"}
          </Badge>
        )}
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Users className="size-4" />} label="Клиентов" value={`${ov?.totalClients ?? 0}`} hint={`активных: ${ov?.activeClients ?? 0}`} />
        <StatCard icon={<Wallet className="size-4" />} label="Оборот клиентов / мес" value={rub(ov?.totalMrrRub ?? 0)} />
        <StatCard icon={<Percent className="size-4" />} label="Моя комиссия" value={`${ov?.commissionPercent ?? 0}%`} />
        <StatCard icon={<Wallet className="size-4" />} label="Мой доход / мес" value={rub(ov?.totalEarningsRub ?? 0)} accent />
      </div>

      {/* Мои клиенты */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="size-4" /> Мои клиенты
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {clients.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Пока нет клиентов. Скоро здесь появится кнопка «Подключить клиента».
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Клиент</th>
                    <th className="px-4 py-2 font-medium">Подписка</th>
                    <th className="px-4 py-2 font-medium">Продукты</th>
                    <th className="px-4 py-2 font-medium text-right">Платит / мес</th>
                    <th className="px-4 py-2 font-medium text-right">Мой доход / мес</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.companyId} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{c.name || "—"}</td>
                      <td className="px-4 py-2.5">
                        <Badge variant="outline" className="text-[11px]">
                          {SUB_LABEL[c.subscriptionStatus ?? ""] ?? (c.subscriptionStatus || "—")}
                        </Badge>
                        {c.planName && <span className="ml-1.5 text-xs text-muted-foreground">{c.planName}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {c.modules.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {c.modules.map((m) => (
                              <Badge key={m.slug} variant="secondary" className="text-[10px]">{m.name}</Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{rub(c.mrrRub)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">{rub(c.earningsRub)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function StatCard({ icon, label, value, hint, accent }: {
  icon: React.ReactNode; label: string; value: string; hint?: string; accent?: boolean
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <div className={"text-lg font-bold " + (accent ? "text-emerald-600 dark:text-emerald-400" : "")}>{value}</div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}
