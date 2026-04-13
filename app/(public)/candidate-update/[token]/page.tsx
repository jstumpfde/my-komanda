"use client"

import { useState, useEffect, use } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, CheckCircle2, X } from "lucide-react"
import { toast } from "sonner"

interface CandidateData {
  name: string
  email: string | null
  phone: string | null
  city: string | null
  experience: string | null
  vacancyTitle: string
  companyName: string
  missingFields: string[]
}

type PageState = "loading" | "form" | "submitted" | "error"

export default function CandidateUpdatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [state, setState] = useState<PageState>("loading")
  const [data, setData] = useState<CandidateData | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Form fields
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [city, setCity] = useState("")
  const [experience, setExperience] = useState("")

  useEffect(() => {
    fetch(`/api/public/candidate-update/${token}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error("invalid")))
      .then((d: CandidateData) => {
        setData(d)
        setEmail(d.email || "")
        setPhone(d.phone || "")
        setCity(d.city || "")
        setExperience(d.experience || "")
        setState("form")
      })
      .catch(() => setState("error"))
  }, [token])

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/candidate-update/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), phone: phone.trim(), city: city.trim(), experience: experience.trim() }),
      })
      if (!res.ok) throw new Error()
      setState("submitted")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSubmitting(false)
    }
  }

  if (state === "loading") {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
  }

  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full"><CardContent className="py-12 text-center">
          <X className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-2">Ссылка недействительна</h2>
          <p className="text-sm text-muted-foreground">Срок действия ссылки истёк или она уже использована.</p>
        </CardContent></Card>
      </div>
    )
  }

  if (state === "submitted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full"><CardContent className="py-12 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold mb-2">Данные обновлены!</h2>
          <p className="text-sm text-muted-foreground">Спасибо за дополнение. Мы свяжемся с вами.</p>
        </CardContent></Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold">{data?.companyName}</h1>
          <p className="text-sm text-muted-foreground mt-1">Дополните данные для позиции "{data?.vacancyTitle}"</p>
        </div>

        <Card>
          <CardContent className="py-6 space-y-4">
            {data?.missingFields.includes("Email") && (
              <div className="space-y-1.5">
                <Label className="text-sm">Email</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="ivan@mail.ru" type="email" className="h-10" />
              </div>
            )}
            {data?.missingFields.includes("Телефон") && (
              <div className="space-y-1.5">
                <Label className="text-sm">Телефон</Label>
                <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+7 (999) 123-45-67" className="h-10" />
              </div>
            )}
            {data?.missingFields.includes("Город") && (
              <div className="space-y-1.5">
                <Label className="text-sm">Город</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Москва" className="h-10" />
              </div>
            )}
            {data?.missingFields.includes("Опыт работы") && (
              <div className="space-y-1.5">
                <Label className="text-sm">Опыт работы</Label>
                <Textarea value={experience} onChange={e => setExperience(e.target.value)} placeholder="Расскажите о релевантном опыте..." rows={3} className="resize-none" />
              </div>
            )}
            <Button className="w-full h-11" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Сохранить
            </Button>
          </CardContent>
        </Card>
        <p className="text-center text-[11px] text-muted-foreground/60">Powered by Komanda</p>
      </div>
    </div>
  )
}
