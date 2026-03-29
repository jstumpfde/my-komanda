"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Building2, UserCheck, LogIn, UserPlus, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { signIn } from "next-auth/react"

interface Props {
  token: string
  companyName: string
  roleLabel: string
  label: string | null
  isLoggedIn: boolean
  currentCompany: string | null
}

export default function AcceptInviteClient({
  token,
  companyName,
  roleLabel,
  label,
  isLoggedIn,
  currentCompany,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<"choose" | "login" | "register">("choose")

  // Register form
  const [name, setName]         = useState("")
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")

  // Login form
  const [loginEmail,    setLoginEmail]    = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  // Принять приглашение — вызов API
  const acceptInvite = async (userId?: string) => {
    const res = await fetch(`/api/invites/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, userId }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error ?? "Ошибка при принятии приглашения")
    }
    return res.json()
  }

  // Уже авторизован — просто вступить в компанию
  const handleJoin = async () => {
    setLoading(true)
    try {
      await acceptInvite()
      toast.success(`Добро пожаловать в ${companyName}!`)
      router.push("/overview")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Регистрация + принятие
  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      toast.error("Заполните все поля")
      return
    }
    setLoading(true)
    try {
      // 1. Регистрируем через обычный endpoint, передавая inviteToken
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, inviteToken: token }),
      })
      const regData = await regRes.json()
      if (!regRes.ok) throw new Error(regData.error ?? "Ошибка регистрации")

      // 2. Авторизуемся
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })
      if (result?.error) throw new Error("Ошибка входа после регистрации")

      toast.success(`Добро пожаловать в ${companyName}!`)
      router.push("/overview")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // Войти в существующий аккаунт + принятие
  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword) {
      toast.error("Введите email и пароль")
      return
    }
    setLoading(true)
    try {
      const result = await signIn("credentials", {
        email: loginEmail,
        password: loginPassword,
        redirect: false,
      })
      if (result?.error) throw new Error("Неверный email или пароль")

      // Принять инвайт уже авторизованным
      await acceptInvite()
      toast.success(`Добро пожаловать в ${companyName}!`)
      router.push("/overview")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="max-w-md w-full space-y-4">

        {/* Карточка с инфо о компании */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Приглашение в команду</p>
                <CardTitle className="text-lg leading-tight">{companyName}</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Роль:</span>
              <Badge variant="outline" className="text-xs">{roleLabel}</Badge>
            </div>
            {label && (
              <p className="text-xs text-muted-foreground italic">«{label}»</p>
            )}
          </CardContent>
        </Card>

        {/* Действия */}
        {isLoggedIn && !currentCompany && (
          // Авторизован, без компании — можно сразу принять
          <Card>
            <CardContent className="pt-6 space-y-3">
              <p className="text-sm text-center text-muted-foreground">
                Вы уже авторизованы. Нажмите, чтобы вступить в команду.
              </p>
              <Button className="w-full" onClick={handleJoin} disabled={loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Вступить в команду
              </Button>
            </CardContent>
          </Card>
        )}

        {isLoggedIn && currentCompany && (
          // Уже в другой компании
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-center text-muted-foreground">
                Вы уже состоите в другой компании. Для принятия приглашения выйдите из текущего аккаунта.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoggedIn && mode === "choose" && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <Button className="w-full gap-2" onClick={() => setMode("register")}>
                <UserPlus className="w-4 h-4" />
                Зарегистрироваться и вступить
              </Button>
              <div className="relative">
                <Separator />
                <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
                  <span className="bg-card px-2 text-xs text-muted-foreground">или</span>
                </span>
              </div>
              <Button variant="outline" className="w-full gap-2" onClick={() => setMode("login")}>
                <LogIn className="w-4 h-4" />
                Войти в существующий аккаунт
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoggedIn && mode === "register" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Регистрация</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Имя</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Иван Иванов" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="ivan@company.ru" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Пароль</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Минимум 8 символов" />
              </div>
              <Button className="w-full" onClick={handleRegister} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Зарегистрироваться
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setMode("choose")}>
                Назад
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoggedIn && mode === "login" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Вход</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-sm">Email</Label>
                <Input type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="ivan@company.ru" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Пароль</Label>
                <Input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
              </div>
              <Button className="w-full" onClick={handleLogin} disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Войти
              </Button>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setMode("choose")}>
                Назад
              </Button>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  )
}
