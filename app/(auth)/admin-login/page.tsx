"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { KeyRound } from "lucide-react"
import { loginWithPasskey } from "@/lib/auth/passkey-client"

// Личная страница входа по ключу (passkey) — только для владельца платформы.
// Никакой формы email/пароль, никакого VK/Яндекс — единственное действие.
// Не связана с общим /login, нигде не рекламируется в навигации.
function AdminLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") ?? "/"

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handlePasskey = async () => {
    setError("")
    setLoading(true)
    try {
      const token = await loginWithPasskey()
      const result = await signIn("passkey", { token, redirect: false })
      if (result?.error) {
        setError("Вход по ключу не удался.")
        return
      }
      router.push(callbackUrl)
      router.refresh()
    } catch (err) {
      // Отмена пользователем (NotAllowedError) — молча, без ошибки-крика.
      if (err instanceof Error && err.name === "NotAllowedError") return
      setError(err instanceof Error ? err.message : "Вход по ключу не удался")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-xs space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg">
            <KeyRound className="w-6 h-6 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">Company24.Pro</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Вход по ключу</p>
          </div>
        </div>

        <Card className="border">
          <CardContent className="pt-6 pb-6 space-y-4">
            <Button
              type="button"
              className="w-full h-12 gap-2 font-semibold"
              onClick={handlePasskey}
              disabled={loading}
            >
              <KeyRound className="w-4 h-4" />
              {loading ? "Проверяем ключ..." : "Войти по ключу"}
            </Button>

            {error && (
              <p className="text-sm text-destructive text-center flex items-center justify-center gap-1.5">
                <span className="text-base">⚠️</span> {error}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  )
}
