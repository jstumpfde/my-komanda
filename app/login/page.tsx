"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { Briefcase, ArrowRight, Eye, EyeOff } from "lucide-react"
import Link from "next/link"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { toast.error("Заполните все поля"); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 800))
    toast.success("Вход выполнен!")
    router.push("/")
  }

  const handleSocial = (provider: string) => {
    toast.info(`Вход через ${provider} (заглушка)`)
    setTimeout(() => router.push("/"), 500)
  }

  const handleReset = () => {
    if (!resetEmail) { toast.error("Введите email"); return }
    toast.success(`Ссылка для сброса отправлена на ${resetEmail}`)
    setForgotOpen(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold">
              <Briefcase className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-foreground">Моя Команда</span>
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Войти в Моя Команда</h1>
          <p className="text-muted-foreground text-sm mt-1">Добро пожаловать!</p>
        </div>

        <Card className="border-none shadow-lg">
          <CardContent className="pt-6 pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.ru" autoFocus />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Пароль</Label>
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => setForgotOpen(true)}>Забыли пароль?</button>
                </div>
                <div className="relative">
                  <Input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPw(!showPw)}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                {loading ? "Входим..." : "Войти"} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center"><Separator /></div>
              <div className="relative flex justify-center"><span className="bg-card px-3 text-xs text-muted-foreground">или</span></div>
            </div>

            <div className="space-y-2">
              <Button variant="outline" className="w-full h-10 gap-2" onClick={() => handleSocial("VK ID")}>
                <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-white text-[10px] font-bold">VK</div>
                Войти через VK ID
              </Button>
              <Button variant="outline" className="w-full h-10 gap-2" onClick={() => handleSocial("Яндекс")}>
                <div className="w-5 h-5 rounded bg-amber-400 flex items-center justify-center text-white text-[10px] font-bold">Я</div>
                Войти через Яндекс
              </Button>
              <Button variant="outline" className="w-full h-10 gap-2" onClick={() => handleSocial("Google")}>
                <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">G</div>
                Войти через Google
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-primary hover:underline font-medium">Попробовать бесплатно</Link>
        </p>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Восстановление пароля</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">Введите email и мы отправим ссылку для сброса пароля</p>
            <Input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="email@company.ru" />
            <Button className="w-full" onClick={handleReset}>Отправить ссылку</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
