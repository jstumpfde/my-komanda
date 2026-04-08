"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Building2, Loader2, CheckCircle2, XCircle } from "lucide-react"
import Link from "next/link"

export default function JoinPage() {
  const params = useParams()
  const router = useRouter()
  const { data: session, update: updateSession } = useSession()
  const code = params.code as string

  const [state, setState] = useState<"loading" | "valid" | "invalid" | "joining" | "done">("loading")
  const [companyName, setCompanyName] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/companies/join?code=${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then((data: { company?: { name: string }; error?: string }) => {
        if (data.company) {
          setCompanyName(data.company.name)
          setState("valid")
        } else {
          setError(data.error ?? "Ссылка недействительна")
          setState("invalid")
        }
      })
      .catch(() => { setError("Ошибка сети"); setState("invalid") })
  }, [code])

  const handleJoin = async () => {
    if (!session?.user) {
      router.push(`/login?callbackUrl=/join/${code}`)
      return
    }
    setState("joining")
    try {
      const res = await fetch("/api/companies/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; companyName?: string }
      if (data.ok) {
        await updateSession({})
        setCompanyName(data.companyName ?? companyName)
        setState("done")
      } else {
        setError(data.error ?? "Ошибка")
        setState("invalid")
      }
    } catch {
      setError("Ошибка сети")
      setState("invalid")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-6 px-6 text-center space-y-4">
          {state === "loading" && (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-muted-foreground mx-auto" />
              <p className="text-muted-foreground">Проверяем ссылку...</p>
            </>
          )}

          {state === "valid" && (
            <>
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Building2 className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-xl font-semibold">Присоединиться к компании</h1>
              <p className="text-lg font-medium text-foreground">{companyName}</p>
              <p className="text-sm text-muted-foreground">
                После присоединения вы станете сотрудником компании. Руководитель настроит ваши права доступа.
              </p>
              <Button onClick={handleJoin} className="w-full h-11">
                {session?.user ? "Присоединиться" : "Войти и присоединиться"}
              </Button>
            </>
          )}

          {state === "joining" && (
            <>
              <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">Присоединяемся...</p>
            </>
          )}

          {state === "done" && (
            <>
              <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-600" />
              </div>
              <h1 className="text-xl font-semibold">Готово!</h1>
              <p className="text-sm text-muted-foreground">
                Вы присоединились к компании <strong>{companyName}</strong>. Ожидайте настройки доступа от руководителя.
              </p>
              <Link href="/settings/profile">
                <Button variant="outline" className="w-full">Перейти в профиль</Button>
              </Link>
            </>
          )}

          {state === "invalid" && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
                <XCircle className="w-8 h-8 text-red-600" />
              </div>
              <h1 className="text-xl font-semibold">Ссылка недействительна</h1>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Link href="/login">
                <Button variant="outline" className="w-full">На главную</Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
