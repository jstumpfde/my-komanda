"use client"

// /admin/platform/leads — заявки с /landing и /portfolio (landing_leads).
// Данные грузит сам клиент через /api/platform/leads (owner-only).
import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Phone, Building2, MessageSquare, ShieldCheck } from "lucide-react"

interface Lead {
  id: string
  name: string
  contact: string
  company: string | null
  interest: string
  comment: string | null
  source: string | null
  status: string
  consentAt: string | null
  createdAt: string
}

const INTEREST_LABEL: Record<string, string> = {
  demo: "Демонстрация",
  consultation: "Консультация",
  website: "Заказ сайта",
}
const STATUS_LABEL: Record<string, string> = { new: "Новая", contacted: "Связались", closed: "Закрыта" }
const STATUS_COLOR: Record<string, string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-amber-100 text-amber-700",
  closed: "bg-green-100 text-green-700",
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
  } catch { return iso }
}

export function LeadsClient() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>("all")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/platform/leads", { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Ошибка загрузки")
      setLeads(d.leads || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function setStatus(id: string, status: string) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)))
    try {
      const r = await fetch(`/api/platform/leads/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
      })
      if (!r.ok) throw new Error("Ошибка сохранения статуса")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
      load()
    }
  }

  const filtered = filter === "all" ? leads : leads.filter((l) => l.interest === filter);
  const counts = { all: leads.length, demo: 0, consultation: 0, website: 0 } as Record<string, number>
  leads.forEach((l) => { counts[l.interest] = (counts[l.interest] || 0) + 1 })

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" /> Заявки
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            С публичных страниц /landing и /portfolio — демо, консультации, заказы сайтов.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Обновить">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {["all", "website", "demo", "consultation"].map((f) => (
          <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
            {f === "all" ? "Все" : INTEREST_LABEL[f]} ({counts[f] || 0})
          </Button>
        ))}
      </div>

      <div className="space-y-2">
        {loading && leads.length === 0 && <p className="text-sm text-muted-foreground">Загрузка…</p>}
        {!loading && filtered.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground">Заявок пока нет.</Card>
        )}
        {filtered.map((l) => (
          <Card key={l.id} className="p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{l.name}</span>
                  <Badge variant="secondary" className="text-xs">{INTEREST_LABEL[l.interest] ?? l.interest}</Badge>
                  {l.consentAt && (
                    <span title={`Согласие на ПД: ${fmtDate(l.consentAt)}`}>
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" /> {l.contact}
                </div>
                {l.company && (
                  <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5" /> {l.company}
                  </div>
                )}
                {l.comment && <p className="text-sm mt-2">{l.comment}</p>}
                <p className="text-xs text-muted-foreground mt-2">{fmtDate(l.createdAt)}{l.source ? ` · ${l.source}` : ""}</p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <select
                  value={l.status}
                  onChange={(e) => setStatus(l.id, e.target.value)}
                  className={`text-xs rounded-full px-3 py-1 border-0 font-medium cursor-pointer ${STATUS_COLOR[l.status] ?? ""}`}
                >
                  {Object.entries(STATUS_LABEL).map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
