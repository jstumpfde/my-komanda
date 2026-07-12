"use client"

// /big-life/orders — список заказов из корзины biglife.company24.pro.
// Данные грузит сам клиент через /api/modules/big-life/orders. Простой
// табличный вид без фильтров/пагинации — заказов пока мало (нет оплаты,
// только один товар в продаже), усложнять рано.
import { useEffect, useState, useCallback } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, ShoppingCart } from "lucide-react"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

interface OrderItem {
  coverId: string
  coverTitle: string
  price: number
  qty: number
}

interface Order {
  id: string
  items: OrderItem[]
  totalPrice: number
  deliveryMethod: "russia_post" | "moscow_courier"
  deliveryAddress: string
  contactName: string
  phone: string
  consentPrivacyAt: string
  consentOfferAt: string
  consentMarketingAt: string | null
  status: "new" | "contacted" | "done" | "cancelled"
  createdAt: string
}

const DELIVERY_LABEL: Record<Order["deliveryMethod"], string> = {
  russia_post: "Почта России",
  moscow_courier: "Курьер по Москве",
}

const STATUS_LABEL: Record<Order["status"], string> = {
  new: "Новый",
  contacted: "Связались",
  done: "Выполнен",
  cancelled: "Отменён",
}

const STATUS_VARIANT: Record<Order["status"], "default" | "secondary" | "outline" | "destructive"> = {
  new: "default",
  contacted: "secondary",
  done: "outline",
  cancelled: "destructive",
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
  } catch { return iso }
}

export function BigLifeOrdersClient() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/modules/big-life/orders", { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Ошибка загрузки")
      setOrders(d.orders || [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function updateStatus(id: string, status: Order["status"]) {
    setBusyId(id)
    setOrders(prev => prev.map(o => (o.id === id ? { ...o, status } : o)))
    try {
      const r = await fetch("/api/modules/big-life/orders", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }),
      })
      if (!r.ok) throw new Error()
      toast.success("Статус обновлён")
    } catch {
      toast.error("Не удалось сохранить статус")
      load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" /> Заказы Big Life
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Заказы из корзины biglife.company24.pro — доставка, контакты, согласия 152-ФЗ. Оплаты нет — только захват заказа.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Обновить">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading && orders.length === 0 && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {!loading && orders.length === 0 && (
        <Card className="p-8 text-center text-muted-foreground">Заказов пока нет.</Card>
      )}

      <div className="space-y-3">
        {orders.map((o) => (
          <Card key={o.id} className="p-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{o.contactName}</span>
                  <span className="text-sm text-muted-foreground">{o.phone}</span>
                  <Badge variant={STATUS_VARIANT[o.status]} className="text-xs">{STATUS_LABEL[o.status]}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</div>
              </div>
              <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v as Order["status"])} disabled={busyId === o.id}>
                <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Новый</SelectItem>
                  <SelectItem value="contacted">Связались</SelectItem>
                  <SelectItem value="done">Выполнен</SelectItem>
                  <SelectItem value="cancelled">Отменён</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3 text-sm">
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Позиции</div>
                <ul className="space-y-0.5">
                  {o.items.map((it, idx) => (
                    <li key={idx}>{it.coverTitle} × {it.qty} — {it.price * it.qty} ₽</li>
                  ))}
                </ul>
                <div className="font-medium mt-1">Итого: {o.totalPrice} ₽</div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Доставка</div>
                <div>{DELIVERY_LABEL[o.deliveryMethod]}</div>
                <div className="text-muted-foreground">{o.deliveryAddress}</div>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground flex-wrap">
              <span>Согласие на ПД: {formatDate(o.consentPrivacyAt)}</span>
              <span>Оферта: {formatDate(o.consentOfferAt)}</span>
              <span>Рассылка: {o.consentMarketingAt ? formatDate(o.consentMarketingAt) : "не дано"}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
