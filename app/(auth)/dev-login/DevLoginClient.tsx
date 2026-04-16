"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Wrench, LogIn } from "lucide-react"

interface Props {
  /** Если query-key прошёл gate, но cookie не стоит — клиент закидывает
   *  ключ в /api/dev/login/gate чтобы cookie записался для повторных визитов. */
  persistKey: string | null
}

export default function DevLoginClient({ persistKey }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") ?? "/"
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!persistKey) return
    fetch("/api/dev/login/gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: persistKey }),
    }).catch(() => {})
  }, [persistKey])

  const handleDevLogin = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/dev/login", { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(data.error ?? `HTTP ${res.status}`)
        return
      }
      const { userId } = await res.json() as { userId: string }
      const result = await signIn("dev", { userId, redirect: false })
      if (result?.error) {
        setError("Dev-вход не удался")
        return
      }
      window.location.href = callbackUrl
    } catch {
      setError("Dev-вход не удался")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-700 flex items-center justify-center shadow-lg">
            <Wrench className="w-6 h-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Dev login</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Быстрый вход как демо-директор</p>
          </div>
        </div>

        <Card className="border">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-3 text-xs text-muted-foreground">
              <p>Применяет план <span className="font-mono">pro</span> + все модули ко всем компаниям, затем входит первым активным пользователем с company_id. Если такого нет — создаёт демо-аккаунт.</p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button
              type="button"
              className="w-full h-11 font-semibold"
              onClick={handleDevLogin}
              disabled={loading}
            >
              {loading ? "Входим..." : (
                <span className="flex items-center gap-2"><LogIn className="w-4 h-4" />Войти как демо</span>
              )}
            </Button>

            <button
              type="button"
              onClick={() => router.push("/login")}
              className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Обычный вход
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
