// Токены — read-only (задача 4a: только просмотр баланса/истории/enforcement-
// статуса; управление тарифами/промо — платформенная админка /admin/platform,
// не эта зона). Server component — без интерактивности.
import { Coins, ShieldAlert, ShieldCheck } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import type { BillingStatus, TokenReason } from "@/lib/ai-rop/tokens"
import type { RopTokenLedger } from "@/lib/db/schema"

const REASON_LABEL: Record<TokenReason, string> = {
  plan_grant: "Начисление по тарифу", topup: "Пополнение", promo_bonus: "Промо-бонус",
  call: "Списание за звонок", manual: "Вручную", adjust: "Корректировка",
}

export function TokensSection({ status, ledger }: { status: BillingStatus; ledger: RopTokenLedger[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><Coins className="size-4 text-violet-600" /> Токены</CardTitle>
        <CardDescription>Баланс и история списаний. Тарифы и пополнения — в /admin/platform.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg bg-muted px-3 py-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Баланс</div>
            <div className="text-2xl font-bold tabular-nums">{status.balance.toLocaleString("ru-RU")}</div>
          </div>
          <Badge variant="outline" className={status.enforce ? "gap-1 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" : "gap-1 text-muted-foreground"}>
            {status.enforce ? <ShieldAlert className="size-3" /> : <ShieldCheck className="size-3" />}
            {status.enforce ? "Enforcement включён" : "Enforcement выключен"}
          </Badge>
          {status.blocked && <Badge variant="outline" className="border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400">Блокировка обработки</Badge>}
          {!status.blocked && status.low && <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">Низкий баланс</Badge>}
        </div>

        {ledger.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">Движений по токенам пока нет.</div>
        ) : (
          <DataTable>
            <DataHead>
              <DataHeadCell>Дата</DataHeadCell>
              <DataHeadCell>Причина</DataHeadCell>
              <DataHeadCell align="right">Δ</DataHeadCell>
              <DataHeadCell>Комментарий</DataHeadCell>
            </DataHead>
            <tbody>
              {ledger.slice(0, 20).map((row) => (
                <DataRow key={row.id}>
                  <DataCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(row.createdAt as unknown as string).toLocaleDateString("ru-RU")}</DataCell>
                  <DataCell>{REASON_LABEL[row.reason as TokenReason] || row.reason}</DataCell>
                  <DataCell align="right" className={row.delta >= 0 ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-red-600 dark:text-red-400"}>
                    {row.delta >= 0 ? "+" : ""}{row.delta}
                  </DataCell>
                  <DataCell className="text-xs text-muted-foreground">{row.note || "—"}</DataCell>
                </DataRow>
              ))}
            </tbody>
          </DataTable>
        )}
      </CardContent>
    </Card>
  )
}
