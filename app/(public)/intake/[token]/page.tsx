"use client"

import { useState, useEffect, use, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Upload, X, CheckCircle2, Lock, FileText, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface IntakeFile {
  name: string
  url: string
  size: number
  type: string
}

type PageState = "loading" | "password" | "form" | "submitted" | "error"

export default function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [state, setState] = useState<PageState>("loading")
  const [errorMsg, setErrorMsg] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [password, setPassword] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Form fields
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [requirements, setRequirements] = useState("")
  const [city, setCity] = useState("")
  const [workFormat, setWorkFormat] = useState("")
  const [salaryFrom, setSalaryFrom] = useState("")
  const [salaryTo, setSalaryTo] = useState("")
  const [externalUrl, setExternalUrl] = useState("")
  const [contactName, setContactName] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [files, setFiles] = useState<IntakeFile[]>([])
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Validate token
  useEffect(() => {
    fetch(`/api/public/intake/${token}`)
      .then(res => res.json())
      .then((data: { valid?: boolean; hasPassword?: boolean; companyName?: string; companyLogo?: string | null; error?: string }) => {
        if (data.valid) {
          setCompanyName(data.companyName || "Компания")
          setCompanyLogo(data.companyLogo || null)
          setHasPassword(!!data.hasPassword)
          setState(data.hasPassword ? "password" : "form")
        } else {
          setErrorMsg(data.error || "Ссылка недействительна")
          setState("error")
        }
      })
      .catch(() => {
        setErrorMsg("Не удалось загрузить страницу")
        setState("error")
      })
  }, [token])

  const handlePasswordSubmit = () => {
    if (!password.trim()) return
    setState("form")
  }

  const handleFileUpload = async (fileList: FileList) => {
    setUploading(true)
    for (const file of Array.from(fileList)) {
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name}: слишком большой (макс 20 МБ)`)
        continue
      }
      try {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch("/api/upload/vacancy-attachment", { method: "POST", body: formData })
        const data = (await res.json()) as IntakeFile & { error?: string }
        if (!res.ok) throw new Error(data.error || "Ошибка")
        setFiles(prev => [...prev, { name: data.name, url: data.url, size: data.size, type: data.type }])
      } catch (err) {
        toast.error(`${file.name}: ${err instanceof Error ? err.message : "ошибка"}`)
      }
    }
    setUploading(false)
  }

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Укажите название должности")
      return
    }
    if (!contactName.trim()) {
      toast.error("Укажите контактное лицо")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/public/intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password: hasPassword ? password : undefined,
          data: {
            title: title.trim(),
            description: description.trim(),
            requirements: requirements.trim(),
            city: city.trim(),
            workFormat,
            salaryFrom: salaryFrom.trim(),
            salaryTo: salaryTo.trim(),
            externalUrl: externalUrl.trim(),
            contactName: contactName.trim(),
            contactPhone: contactPhone.trim(),
            contactEmail: contactEmail.trim(),
          },
          files,
        }),
      })

      if (!res.ok) {
        const err = (await res.json()) as { error?: string }
        throw new Error(err.error || "Ошибка отправки")
      }

      setState("submitted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не удалось отправить заявку")
    } finally {
      setSubmitting(false)
    }
  }

  // Loading
  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  // Error
  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <X className="w-6 h-6 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Ссылка недействительна</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Submitted
  if (state === "submitted") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <h2 className="text-lg font-semibold mb-2">Заявка принята!</h2>
            <p className="text-sm text-muted-foreground">Спасибо! Мы свяжемся с вами в ближайшее время.</p>
          </CardContent>
        </Card>
        <Footer />
      </div>
    )
  }

  // Password
  if (state === "password") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="py-8 space-y-4">
            <div className="text-center">
              <Lock className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <h2 className="text-lg font-semibold">Доступ по паролю</h2>
              <p className="text-sm text-muted-foreground mt-1">Введите пароль для заполнения заявки</p>
            </div>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Пароль"
              className="h-10"
              onKeyDown={e => { if (e.key === "Enter") handlePasswordSubmit() }}
              autoFocus
            />
            <Button className="w-full" onClick={handlePasswordSubmit} disabled={!password.trim()}>
              Продолжить
            </Button>
          </CardContent>
        </Card>
        <Footer />
      </div>
    )
  }

  // Form
  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          {companyLogo ? (
            <img src={companyLogo} alt={companyName} className="h-10 mx-auto mb-3 object-contain" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
          )}
          <h1 className="text-xl font-bold">{companyName}</h1>
          <p className="text-sm text-muted-foreground mt-1">Заявка на подбор сотрудника</p>
        </div>

        <Card>
          <CardContent className="py-6 space-y-5">
            {/* Position */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Название должности <span className="text-red-500">*</span></Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Менеджер по продажам" className="h-10" />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Кого ищете, что должен делать</Label>
              <Textarea value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Опишите задачи, которые будет выполнять сотрудник..." rows={4} className="resize-none" />
            </div>

            {/* Requirements */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Что должен уметь</Label>
              <Textarea value={requirements} onChange={e => setRequirements(e.target.value)}
                placeholder="Навыки, опыт, образование..." rows={3} className="resize-none" />
            </div>

            {/* City & Format */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Город</Label>
                <Input value={city} onChange={e => setCity(e.target.value)} placeholder="Москва" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Формат работы</Label>
                <Select value={workFormat} onValueChange={setWorkFormat}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Выберите" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="office">Офис</SelectItem>
                    <SelectItem value="remote">Удалённо</SelectItem>
                    <SelectItem value="hybrid">Гибрид</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Salary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Зарплата от, ₽</Label>
                <Input value={salaryFrom} onChange={e => setSalaryFrom(e.target.value)} placeholder="80 000" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Зарплата до, ₽</Label>
                <Input value={salaryTo} onChange={e => setSalaryTo(e.target.value)} placeholder="150 000" className="h-10" />
              </div>
            </div>

            {/* External URL */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Ссылка на существующую вакансию</Label>
              <Input value={externalUrl} onChange={e => setExternalUrl(e.target.value)} placeholder="https://hh.ru/vacancy/..." className="h-10" />
            </div>

            {/* Files */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Документы</Label>
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.doc,.docx,.xlsx,.txt,.jpg,.png" className="hidden"
                onChange={e => { if (e.target.files?.length) handleFileUpload(e.target.files); e.target.value = "" }} />
              {files.length > 0 && (
                <div className="space-y-1">
                  {files.map(f => (
                    <div key={f.url} className="flex items-center gap-2 px-3 py-1.5 rounded border bg-muted/30 text-sm">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{f.name}</span>
                      <button type="button" onClick={() => setFiles(prev => prev.filter(x => x.url !== f.url))} className="text-muted-foreground hover:text-destructive shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                Прикрепить файл
              </Button>
              <p className="text-[11px] text-muted-foreground">PDF, DOCX, XLSX, JPG, PNG — до 20 МБ</p>
            </div>

            {/* Contact */}
            <div className="border-t pt-5 space-y-4">
              <h3 className="text-sm font-semibold">Контактное лицо</h3>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Имя <span className="text-red-500">*</span></Label>
                <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Иван Иванов" className="h-10" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Телефон</Label>
                  <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+7 (999) 123-45-67" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Email</Label>
                  <Input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="ivan@company.ru" className="h-10" type="email" />
                </div>
              </div>
            </div>

            {/* Submit */}
            <Button className="w-full h-11 text-sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Отправить заявку
            </Button>
          </CardContent>
        </Card>

        <Footer />
      </div>
    </div>
  )
}

function Footer() {
  return (
    <p className="text-center text-[11px] text-muted-foreground/60 mt-6">
      Powered by Komanda
    </p>
  )
}
