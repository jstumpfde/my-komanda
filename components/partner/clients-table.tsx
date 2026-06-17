"use client"

// Таблица клиентов партнёра со СТАТАМИ (мини-админка): тариф, вакансии,
// кандидаты, подписка, доход. Клик по строке открывает карточку клиента.
// Для реферала — только просмотр (без действий), у партнёра карточка управляет.
import { Badge } from "@/components/ui/badge"
import { Briefcase, Users, Eye, Settings2 } from "lucide-react"

export interface PartnerClientRow {
  companyId: string
  name: string
  status: string | null
  subscriptionStatus: string | null
  planName: string | null
  mrrRub: number
  modules: { slug: string; name: string }[]
  commissionPercent: number
  earningsRub: number
  vacancyCount: number
  activeVacancyCount: number
  candidateCount: number
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

export function PartnerClientsTable({
  clients,
  readOnly,
  onOpen,
}: {
  clients: PartnerClientRow[]
  readOnly: boolean
  onOpen: (companyId: string) => void
}) {
  if (clients.length === 0) {
    return (
      <p className="px-6 pb-6 text-sm text-muted-foreground">
        {readOnly
          ? "Пока нет клиентов."
          : "Пока нет клиентов. Нажмите «Подключить клиента» — заведёте компанию, логин директора и продукты."}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-4 py-2 font-medium">Клиент</th>
            <th className="px-4 py-2 font-medium">Тариф</th>
            <th className="px-4 py-2 font-medium">Подписка</th>
            <th className="px-4 py-2 font-medium text-right">Вакансий</th>
            <th className="px-4 py-2 font-medium text-right">Кандидатов</th>
            <th className="px-4 py-2 font-medium text-right">Платит / мес</th>
            <th className="px-4 py-2 font-medium text-right">Мой доход / мес</th>
            <th className="px-4 py-2 font-medium text-right w-10" />
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr
              key={c.companyId}
              className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
              onClick={() => onOpen(c.companyId)}
              title={readOnly ? "Просмотр клиента" : "Настроить продукты клиента"}
            >
              <td className="px-4 py-2.5">
                <div className="font-medium">{c.name || "—"}</div>
                {c.modules.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.modules.slice(0, 4).map((m) => (
                      <Badge key={m.slug} variant="secondary" className="text-[10px]">
                        {m.name}
                      </Badge>
                    ))}
                    {c.modules.length > 4 && (
                      <Badge variant="secondary" className="text-[10px]">
                        +{c.modules.length - 4}
                      </Badge>
                    )}
                  </div>
                )}
              </td>
              <td className="px-4 py-2.5">
                {c.planName ? (
                  <span className="text-xs">{c.planName}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                <Badge variant="outline" className="text-[11px]">
                  {SUB_LABEL[c.subscriptionStatus ?? ""] ?? (c.subscriptionStatus || "—")}
                </Badge>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1">
                  <Briefcase className="size-3.5 text-muted-foreground" />
                  {c.vacancyCount}
                  {c.activeVacancyCount > 0 && c.activeVacancyCount !== c.vacancyCount && (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                      ({c.activeVacancyCount} акт.)
                    </span>
                  )}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                <span className="inline-flex items-center justify-end gap-1">
                  <Users className="size-3.5 text-muted-foreground" />
                  {c.candidateCount}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{rub(c.mrrRub)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                {rub(c.earningsRub)}
              </td>
              <td className="px-4 py-2.5 text-right text-muted-foreground">
                {readOnly ? <Eye className="size-4 inline" /> : <Settings2 className="size-4 inline" />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
