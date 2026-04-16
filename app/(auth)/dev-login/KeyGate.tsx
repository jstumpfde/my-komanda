"use client"

import { useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Lock, ArrowRight } from "lucide-react"

export default function KeyGate() {
  const [key, setKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch("/api/dev/login/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      })
      const data = await res.json() as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Неверный ключ")
        return
      }
      window.location.reload()
    } catch {
      setError("Ошибка соединения")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-700 flex items-center justify-center shadow-lg">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Dev login</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Секретный вход — только для администратора</p>
          </div>
        </div>

        <Card className="border">
          <CardContent className="pt-6 pb-6 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="dev-key" className="text-sm font-medium">Ключ доступа</Label>
                <Input
                  id="dev-key"
                  type="password"
                  value={key}
                  onChange={(e) => { setKey(e.target.value); setError("") }}
                  placeholder="DEV_LOGIN_KEY"
                  autoFocus
                  autoComplete="off"
                  className={error ? "border-destructive focus-visible:ring-destructive" : ""}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading || !key.trim()}>
                {loading ? "Проверяем..." : (
                  <span className="flex items-center gap-2">Войти<ArrowRight className="w-4 h-4" /></span>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
