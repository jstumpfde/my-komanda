"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, Building2 } from "lucide-react"

interface StartData {
  blockTitle: string
  contentType: "presentation" | "test" | "task"
  vacancyTitle: string
  companyName: string
  companyLogo: string | null
  companySubdomain: string | null
  brandPrimaryColor: string | null
  brandBgColor: string | null
  brandTextColor: string | null
}

export function StartClient({ token }: { token: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "submitting" | "done">("loading")
  const [data, setData] = useState<StartData | null>(null)
  const [errorMsg, setErrorMsg] = useState("")

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [consent, setConsent] = useState(false)
  const [formError, setFormError] = useState("")

  useEffect(() => {
    fetch(`/api/public/start/${token}`)
      .then(async (r) => {
        const json = await r.json().catch(() => null)
        if (!r.ok) { setErrorMsg(json?.error || "Ссылка недействительна"); setStatus("error"); return }
        setData(json as StartData)
        setStatus("ready")
      })
      .catch(() => { setErrorMsg("Ошибка сети"); setStatus("error") })
  }, [token])

  const brandColor = data?.brandPrimaryColor || "#3b82f6"
  const bgColor = data?.brandBgColor || "#f8fafc"
  const textColor = data?.brandTextColor || "#111827"

  const isValid = name.trim().length > 0 && phone.trim().length >= 5 && consent

  const handleSubmit = async () => {
    if (!isValid || !data) return
    setFormError("")
    setStatus("submitting")
    try {
      const res = await fetch(`/api/public/start/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), consent }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.redirectUrl) {
        setFormError(json?.error || "Не удалось отправить форму")
        setStatus("ready")
        return
      }
      setStatus("done")
      window.location.href = json.redirectUrl as string
    } catch {
      setFormError("Ошибка сети")
      setStatus("ready")
    }
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (status === "error" || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-sm text-center space-y-2">
          <p className="text-lg font-semibold text-foreground">Ссылка недействительна</p>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: bgColor }}>
      <div className="w-full max-w-md space-y-5">
        <div className="text-center space-y-2">
          {data.companyLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.companyLogo} alt={data.companyName} className="h-12 mx-auto object-contain" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-white/60 flex items-center justify-center mx-auto">
              <Building2 className="h-6 w-6" style={{ color: brandColor }} />
            </div>
          )}
          <p className="text-sm font-medium" style={{ color: textColor }}>{data.companyName}</p>
          <h1 className="text-xl font-bold" style={{ color: textColor }}>{data.vacancyTitle}</h1>
          <p className="text-sm text-muted-foreground">{data.blockTitle}</p>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-gray-700">Имя <span className="text-red-500">*</span></Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Иван"
              className="h-10 bg-white border-gray-300 text-gray-900"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-700">Телефон <span className="text-red-500">*</span></Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 (999) 123-45-67"
              className="h-10 bg-white border-gray-300 text-gray-900"
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 cursor-pointer flex-shrink-0 bg-white [color-scheme:light]"
              style={{ accentColor: brandColor }}
            />
            <span>
              Я согласен на обработку персональных данных в соответствии с{" "}
              <a
                href={data.companySubdomain ? `/politicahr2026?company=${encodeURIComponent(data.companySubdomain)}` : "/politicahr2026"}
                target="_blank"
                rel="noreferrer"
                className="underline hover:opacity-80"
              >
                ФЗ-152
              </a>
              . Данные используются только для целей найма.
            </span>
          </label>

          {formError && <p className="text-xs text-red-600">{formError}</p>}

          <Button
            className="w-full h-11"
            style={{ backgroundColor: brandColor }}
            onClick={handleSubmit}
            disabled={!isValid || status === "submitting"}
          >
            {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Продолжить
          </Button>
        </div>
      </div>
    </div>
  )
}
