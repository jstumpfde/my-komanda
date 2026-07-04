"use client"

// Секция «Ключи входа» в профиле: регистрация passkey (Face ID / отпечаток /
// аппаратный ключ) и управление ключами. Беспарольный вход; пароль остаётся
// запасным.
import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { KeyRound, Trash2, Loader2, Plus } from "lucide-react"
import { registerPasskey, passkeySupported } from "@/lib/auth/passkey-client"

interface PasskeyRow {
  id: string
  deviceName: string | null
  createdAt: string | null
  lastUsedAt: string | null
}

export function PasskeySection() {
  const [rows, setRows] = useState<PasskeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [supported, setSupported] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/passkey/credentials")
      const json = await res.json() as { credentials?: PasskeyRow[] }
      setRows(json.credentials ?? [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setSupported(passkeySupported())
    load()
  }, [load])

  const handleAdd = async () => {
    setAdding(true)
    try {
      await registerPasskey()
      toast.success("Ключ добавлен")
      await load()
    } catch (err) {
      if (err instanceof Error && err.name === "NotAllowedError") return // отмена
      toast.error(err instanceof Error ? err.message : "Не удалось добавить ключ")
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/auth/passkey/credentials?id=${encodeURIComponent(id)}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setRows((prev) => prev.filter((r) => r.id !== id))
      toast.success("Ключ удалён")
    } catch {
      toast.error("Не удалось удалить ключ")
    }
  }

  const fmt = (s: string | null) => {
    if (!s) return "—"
    try { return new Date(s).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" }) } catch { return "—" }
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="w-4 h-4" /> Ключи входа (passkey)
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4 pt-0 space-y-3">
        <p className="text-sm text-muted-foreground">
          Беспарольный вход по Face ID / отпечатку / аппаратному ключу. Пароль остаётся запасным входом.
          Ключ привязан к устройству — добавьте по одному на каждое.
        </p>

        {!supported && (
          <p className="text-sm text-amber-600">Этот браузер не поддерживает passkey.</p>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Загрузка...</div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ключей пока нет.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.deviceName || "Устройство"}</p>
                  <p className="text-xs text-muted-foreground">Добавлен {fmt(r.createdAt)} · последний вход {fmt(r.lastUsedAt)}</p>
                </div>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive shrink-0" onClick={() => handleDelete(r.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button onClick={handleAdd} disabled={adding || !supported} className="gap-2">
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Добавить ключ
        </Button>
      </CardContent>
    </Card>
  )
}
