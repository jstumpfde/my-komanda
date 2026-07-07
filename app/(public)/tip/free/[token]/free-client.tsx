"use client"

// Активация бесплатной ссылки: POST /api/public/tip/free/[token] ->
//   { balanceRuns } | 400 {error}

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

type State = "loading" | "success" | "error"

export default function TipFreeClient() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const token = params?.token
  const [state, setState] = useState<State>("loading")
  const [balanceRuns, setBalanceRuns] = useState<number | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!token) return
    let cancelled = false
    fetch(`/api/public/tip/free/${token}`, { method: "POST" })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || "Ссылка недействительна или уже использована.")
        return d
      })
      .then((d: { balanceRuns: number }) => {
        if (cancelled) return
        setBalanceRuns(d.balanceRuns)
        setState("success")
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Не удалось активировать ссылку.")
        setState("error")
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="mb-6 text-2xl font-bold text-stone-900">Типология</h1>

      {state === "loading" && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-stone-300" />
          <p className="text-stone-500">Активируем вашу ссылку…</p>
        </div>
      )}

      {state === "success" && (
        <div className="flex flex-col items-center gap-4">
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="text-lg font-medium text-stone-800">
            Вам начислено {balanceRuns ?? 0} {pluralizeRuns(balanceRuns ?? 0)}
          </p>
          <Button onClick={() => router.push("/tip")} size="lg" className="mt-2 h-12 w-full bg-amber-500 text-stone-900 hover:bg-amber-400">
            Перейти к разбору
          </Button>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col items-center gap-4">
          <XCircle className="h-12 w-12 text-red-400" />
          <p className="text-stone-700">{error}</p>
          <Button onClick={() => router.push("/tip")} variant="outline" size="lg" className="mt-2 h-12 w-full">
            Перейти к разбору
          </Button>
        </div>
      )}
    </div>
  )
}

function pluralizeRuns(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "разбор"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "разбора"
  return "разборов"
}
