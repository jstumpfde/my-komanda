"use client"

// Менеджеры Bitrix — видимость в отчётах, продукт по умолчанию, синк CRM,
// привязка к пользователю платформы. «Подтянуть имена» — backfillManagerNames()
// через API (дозагрузка ФИО из Bitrix для менеджеров без имени в rop_calls/rop_managers).
//
// «Пользователь платформы» — привязка rop_managers.userId (см. lib/ai-rop/access.ts
// ::ropManagerScope). Привязанный пользователь автоматически становится ролью
// manager модуля: видит на дашборде/в списке звонков только свои (RLS по
// bitrixManagerId), теряет доступ к командной статистике/настройкам. Пусто = не
// привязан (обычный пользователь платформы без роли в AI-РОП).
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Users, RefreshCw, Loader2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const UNLINKED = "__unlinked__"

export interface ManagerRow {
  bitrixManagerId: string
  name: string | null
  isActive: boolean
  excludedFromReports: boolean | null
  defaultProduct: string | null
  crmSyncEnabled: boolean
  userId: string | null
}

export interface PlatformUserOption {
  id: string
  name: string
  email: string
}

function ManagerRowEditor({ m, platformUsers }: { m: ManagerRow; platformUsers: PlatformUserOption[] }) {
  const [inReports, setInReports] = useState(!m.excludedFromReports)
  const [defaultProduct, setDefaultProduct] = useState(m.defaultProduct ?? "")
  const [crmSync, setCrmSync] = useState(m.crmSyncEnabled)
  const [userId, setUserId] = useState(m.userId ?? UNLINKED)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function patch(body: Record<string, unknown>) {
    setBusy(true)
    try {
      await fetch("/api/modules/ai-rop/managers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.bitrixManagerId, ...body }),
      })
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <DataRow>
      <DataCell className="font-medium">{m.name || <span className="text-muted-foreground">ID {m.bitrixManagerId}</span>}</DataCell>
      <DataCell>{m.isActive ? <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">активен</Badge> : <Badge variant="outline" className="text-muted-foreground">неактивен</Badge>}</DataCell>
      <DataCell>
        <Select
          value={userId}
          onValueChange={(v) => { setUserId(v); patch({ user_id: v === UNLINKED ? null : v }) }}
          disabled={busy}
        >
          <SelectTrigger className="h-8 w-full min-w-[160px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={UNLINKED}>— Не привязан —</SelectItem>
            {platformUsers.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>)}
          </SelectContent>
        </Select>
      </DataCell>
      <DataCell>
        <div className="flex items-center gap-2">
          <Switch checked={inReports} disabled={busy} onCheckedChange={(v) => { setInReports(v); patch({ excluded_from_reports: !v }) }} />
          <span className="text-xs text-muted-foreground">{inReports ? "В отчётах" : "Скрыт"}</span>
        </div>
      </DataCell>
      <DataCell>
        <Input
          value={defaultProduct}
          onChange={(e) => setDefaultProduct(e.target.value)}
          onBlur={() => patch({ default_product: defaultProduct.trim() || null })}
          placeholder="МП / МК…"
          className="h-8 w-28 text-xs"
        />
      </DataCell>
      <DataCell><Switch checked={crmSync} disabled={busy} onCheckedChange={(v) => { setCrmSync(v); patch({ crm_sync_enabled: v }) }} /></DataCell>
    </DataRow>
  )
}

export function ManagersCard({ managers, platformUsers }: { managers: ManagerRow[]; platformUsers: PlatformUserOption[] }) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function backfillNames() {
    setBusy(true)
    try {
      await fetch("/api/modules/ai-rop/managers/backfill", { method: "POST" })
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm"><Users className="size-4 text-violet-600" /> Менеджеры</CardTitle>
        <CardDescription>Видимость в отчётах, продукт по умолчанию для авто-распознавания, синк исхода сделки из CRM, привязка к пользователю платформы (роль manager AI-РОП).</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={backfillNames} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Подтянуть имена
          </Button>
        </div>
        {managers.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Пока нет ни одного менеджера — появятся после первого импорта звонков.</div>
        ) : (
          <DataTable>
            <DataHead>
              <DataHeadCell>Имя</DataHeadCell>
              <DataHeadCell>Статус в Bitrix</DataHeadCell>
              <DataHeadCell>Пользователь платформы</DataHeadCell>
              <DataHeadCell>В отчётах</DataHeadCell>
              <DataHeadCell>Продукт по умолчанию</DataHeadCell>
              <DataHeadCell>Синк CRM</DataHeadCell>
            </DataHead>
            <tbody>{managers.map((m) => <ManagerRowEditor key={m.bitrixManagerId} m={m} platformUsers={platformUsers} />)}</tbody>
          </DataTable>
        )}
      </CardContent>
    </Card>
  )
}
