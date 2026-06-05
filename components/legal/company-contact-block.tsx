"use client"

// Контактный блок компании для /settings/legal: показывает реквизиты
// «куда обращаться» (название/email/телефон/юр.адрес), которые подставляются
// в публичную политику и документы. Если email пуст — спокойно подсказывает
// заполнить его (генератор шаблона требует ИНН + email).

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Building2, Mail, Phone, MapPin, AlertTriangle, ArrowRight, Loader2 } from "lucide-react"
import { fetchCompanyApi } from "@/lib/company-storage"

interface CompanyContacts {
  name?: string
  email?: string
  phone?: string
  legalAddress?: string
}

export function CompanyContactBlock() {
  const [loading, setLoading] = useState(true)
  const [c, setC] = useState<CompanyContacts>({})

  useEffect(() => {
    let cancelled = false
    fetchCompanyApi()
      .then((data) => {
        if (cancelled) return
        const r = (data ?? {}) as Record<string, unknown>
        const s = (k: string) => (typeof r[k] === "string" ? (r[k] as string) : "")
        setC({ name: s("name"), email: s("email"), phone: s("phone"), legalAddress: s("legalAddress") })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const rows: { icon: typeof Mail; label: string; value: string }[] = [
    { icon: Building2, label: "Компания", value: c.name ?? "" },
    { icon: Mail, label: "Email", value: c.email ?? "" },
    { icon: Phone, label: "Телефон", value: c.phone ?? "" },
    { icon: MapPin, label: "Юр. адрес", value: c.legalAddress ?? "" },
  ]

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="w-4 h-4" /> Контактные данные для документов
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Эти реквизиты подставляются в публичную политику конфиденциальности
          (раздел «куда обращаться»). Редактируются в{" "}
          <Link href="/settings/company" className="text-primary hover:underline">Настройках компании</Link>.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Загрузка...
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {rows.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-2 text-sm">
                  <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground w-24 shrink-0">{label}</span>
                  <span className={value ? "text-foreground" : "text-muted-foreground/60 italic"}>
                    {value || "не указано"}
                  </span>
                </div>
              ))}
            </div>
            {!c.email && (
              <div className="flex items-start gap-2 mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  Не указан контактный email — без него не сгенерировать шаблон политики
                  и не на что принимать обращения по персональным данным.{" "}
                  <Link href="/settings/company" className="font-medium underline inline-flex items-center gap-0.5">
                    Заполнить <ArrowRight className="w-3 h-3" />
                  </Link>
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
