"use client"

import { useState } from "react"

interface Props {
  slug: string
  companyName: string
  logo: string | null
  title: string
  slogan: string
}

export function SubmitForm({ slug, companyName, logo, title, slogan }: Props) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", telegram: "", position: "", comment: "" })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    if (!form.name.trim()) { setError("Укажите имя"); return }
    setSubmitting(true); setError("")
    try {
      const res = await fetch("/api/public/talent-form", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...form }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error || "Не удалось отправить"); return }
      setDone(true)
    } catch { setError("Ошибка сети") }
    finally { setSubmitting(false) }
  }

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-6">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={companyName} className="w-12 h-12 rounded-xl object-contain bg-white border p-1" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xl font-bold">{companyName.charAt(0)}</div>
          )}
          <div>
            <p className="font-semibold text-slate-900">{companyName}</p>
            {slogan && <p className="text-xs text-slate-500">{slogan}</p>}
          </div>
        </div>

        <div className="bg-white rounded-2xl border shadow-sm p-6">
          {done ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 text-2xl">✓</div>
              <h2 className="text-lg font-semibold text-slate-900">Спасибо!</h2>
              <p className="text-sm text-slate-500 mt-1">Ваша анкета отправлена. Мы свяжемся с вами.</p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-bold text-slate-900">{title || "Анкета кандидата"}</h1>
              <p className="text-sm text-slate-500 mt-1 mb-5">Заполните форму — это займёт меньше минуты.</p>
              <div className="space-y-3">
                <Field label="Имя" required value={form.name} onChange={set("name")} placeholder="Имя Фамилия" />
                <Field label="Телефон" value={form.phone} onChange={set("phone")} placeholder="+7 ..." />
                <Field label="Email" value={form.email} onChange={set("email")} placeholder="you@mail.ru" />
                <Field label="Telegram" value={form.telegram} onChange={set("telegram")} placeholder="@username" />
                <Field label="Желаемая должность" value={form.position} onChange={set("position")} placeholder="" />
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Комментарий</label>
                  <textarea value={form.comment} onChange={set("comment")} rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400 resize-y" />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button onClick={submit} disabled={submitting}
                  className="w-full h-11 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-60">
                  {submitting ? "Отправка…" : "Отправить анкету"}
                </button>
              </div>
            </>
          )}
        </div>
        <p className="text-center text-xs text-slate-400 mt-6">Powered by Company24</p>
      </div>
    </main>
  )
}

function Field({ label, required, value, onChange, placeholder }: {
  label: string; required?: boolean; value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      <input value={value} onChange={onChange} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400" />
    </div>
  )
}
