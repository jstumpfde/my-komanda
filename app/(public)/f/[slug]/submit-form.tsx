"use client"

import { useState } from "react"
import type { TalentFormField } from "@/lib/db/schema"

// Form builder field keys that map to supported DB columns.
// firstName/lastName both collapse into the single `name` column.
const KEY_TO_STATE: Record<string, keyof FormState | null> = {
  firstName:   "name",
  lastName:    "name",
  email:       "email",
  phone:       "phone",
  telegram:    "telegram",
  position:    "position",
  company:     "company",
  comment:     "comment",
  coverLetter: "comment",
  city:        null,      // no DB column yet
  resume:      null,
  portfolio:   null,
  referrer:    null,
  employee:    null,
}

interface FormState {
  name: string; phone: string; email: string; telegram: string
  position: string; company: string; comment: string
}

interface RenderedField {
  stateKey: keyof FormState
  label: string
  required: boolean
  multiline?: boolean
  placeholder?: string
}

function buildFields(fields: TalentFormField[]): RenderedField[] | null {
  const enabled = fields.filter(f => f.enabled && KEY_TO_STATE[f.key] !== undefined && KEY_TO_STATE[f.key] !== null)
  if (!enabled.length) return null

  const seen = new Set<keyof FormState>()
  const result: RenderedField[] = []

  for (const f of enabled) {
    const stateKey = KEY_TO_STATE[f.key] as keyof FormState | null
    if (!stateKey || seen.has(stateKey)) continue
    seen.add(stateKey)

    const isComment = stateKey === "comment"
    // When firstName AND lastName both exist, show combined label
    const label = (f.key === "firstName" || f.key === "lastName")
      ? (fields.some(x => x.enabled && x.key === "lastName" && f.key === "firstName") ? "Имя и фамилия" : f.label)
      : f.label

    result.push({ stateKey, label, required: f.required, multiline: isComment })
  }

  // Guarantee name is first if present
  const nameIdx = result.findIndex(r => r.stateKey === "name")
  if (nameIdx > 0) result.unshift(...result.splice(nameIdx, 1))

  return result
}

// Fallback hardcoded fields when form has no field config.
const STATIC_FIELDS: RenderedField[] = [
  { stateKey: "name",     label: "Имя",               required: true,  placeholder: "Имя Фамилия" },
  { stateKey: "phone",    label: "Телефон",            required: false, placeholder: "+7 ..." },
  { stateKey: "email",    label: "Email",              required: false, placeholder: "you@mail.ru" },
  { stateKey: "telegram", label: "Telegram",           required: false, placeholder: "@username" },
  { stateKey: "position", label: "Желаемая должность", required: false },
  { stateKey: "comment",  label: "Комментарий",        required: false, multiline: true },
]

interface Props {
  slug: string
  companyName: string
  logo: string | null
  title: string
  slogan: string
  fields: TalentFormField[]
}

export function SubmitForm({ slug, companyName, logo, title, slogan, fields }: Props) {
  const [form, setForm] = useState<FormState>({ name: "", phone: "", email: "", telegram: "", position: "", company: "", comment: "" })
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  const renderedFields = buildFields(fields) ?? STATIC_FIELDS

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    if (!form.name.trim()) { setError("Укажите имя"); return }
    const requiredMissing = renderedFields.find(f => f.required && !form[f.stateKey].trim())
    if (requiredMissing) { setError(`Заполните поле «${requiredMissing.label}»`); return }

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
                {renderedFields.map(f =>
                  f.multiline ? (
                    <div key={f.stateKey}>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {f.label}{f.required && <span className="text-red-500"> *</span>}
                      </label>
                      <textarea value={form[f.stateKey]} onChange={set(f.stateKey)} rows={3}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400 resize-y" />
                    </div>
                  ) : (
                    <Field key={f.stateKey} label={f.label} required={f.required}
                      value={form[f.stateKey]} onChange={set(f.stateKey)}
                      placeholder={f.placeholder} />
                  )
                )}
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
