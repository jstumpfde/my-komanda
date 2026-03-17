"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Briefcase, ArrowRight, Eye, EyeOff } from "lucide-react"
import Link from "next/link"

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [company, setCompany] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !password || !company) { toast.error("Заполните все поля"); return }
    setLoading(true)
    await new Promise(r => setTimeout(r, 1000))
    toast.success("Аккаунт создан!")
    router.push("/onboarding")
  }

  const handleSocial = (provider: string) => {
    toast.info(`Вход через ${provider} (заглушка)`)
    setTimeout(() => router.push("/onboarding"), 500)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold">
              <Briefcase className="w-5 h-5" />
            </div>
            <span className="text-xl font-bold text-foreground">HireFlow</span>
          </div>
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Начните бесплатно — 7 дней Trial</h1>
          <p className="text-muted-foreground text-sm mt-1">Создайте аккаунт и начните нанимать за 5 минут</p>
        </div>

        <Card className="border-none shadow-lg">
          <CardContent className="pt-6 pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Имя</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Как вас зовут?" autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@company.ru" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Пароль</Label>
                <div className="relative">
                  <Input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Минимум 8 символов" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPw(!showPw)}>
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Название компании</Label>
                <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="ООО Ромашка" />
              </div>
              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                {loading ? "Создаём..." : "Создать аккаунт"} <ArrowRight className="w-4 h-4 ml-2" />
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
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">Войти</Link>
        </p>
      </div>
    </div>
  )
}
