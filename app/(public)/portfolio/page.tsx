"use client"

// /portfolio — публичная страница-портфолио Company24.pro как веб-студии
// (Юрий 08.07): кейсы разработанных сайтов + заявка на разработку. Форма
// шлёт в POST /api/public/landing-lead с interest="website" (тот же роут,
// что и заявки с /landing — единая точка входа для Telegram-алерта и
// видимости в /admin/platform/leads, см. lib/landing/lead-guard.ts).
import { useState, type FormEvent } from "react"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Check, Loader2, ExternalLink, Sparkles } from "lucide-react"

type LeadStatus = "idle" | "submitting" | "success" | "error"

const CASES = [
  {
    slug: "biglife",
    name: "BiG life",
    tagline: "Онлайн-журнал о моде, бизнесе и светской жизни",
    description:
      "Многостраничный журнал с воронкой контента (обложки, TV, радио, интерактивный ридер), аналитикой чтения и авто-синхронизацией номера из PDF-вёрстки.",
    href: "https://biglife.company24.pro",
    image: "/cases/biglife-case.jpg",
    tags: ["Медиа", "Контент-платформа", "Аналитика"],
  },
]

function LeadForm() {
  const [name, setName] = useState("")
  const [contact, setContact] = useState("")
  const [company, setCompany] = useState("")
  const [comment, setComment] = useState("")
  const [website, setWebsite] = useState("") // honeypot
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<LeadStatus>("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (status === "submitting") return
    if (!consent) {
      setErrorMessage("Нужно согласие на обработку персональных данных")
      setStatus("error")
      return
    }
    setStatus("submitting")
    setErrorMessage("")
    try {
      const res = await fetch("/api/public/landing-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, contact, company, interest: "website", comment, website, consent,
          source: "portfolio",
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMessage(data?.error || "Не удалось отправить заявку — попробуйте ещё раз")
        setStatus("error")
        return
      }
      setStatus("success")
    } catch {
      setErrorMessage("Не удалось отправить заявку — проверьте соединение и попробуйте ещё раз")
      setStatus("error")
    }
  }

  if (status === "success") {
    return (
      <div className="max-w-xl mx-auto text-center bg-gray-900 border border-gray-800 rounded-2xl p-10">
        <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-5">
          <Check className="w-7 h-7 text-emerald-400" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Заявка получена</h3>
        <p className="text-gray-400">Свяжемся в ближайшее время</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="relative max-w-xl mx-auto bg-gray-900 border border-gray-800 rounded-2xl p-8 space-y-5">
      <div className="absolute -left-[9999px] w-px h-px overflow-hidden" aria-hidden="true">
        <label htmlFor="pf-website">Website</label>
        <input id="pf-website" name="website" type="text" tabIndex={-1} autoComplete="off"
          value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      <div>
        <label htmlFor="pf-name" className="block text-sm font-medium text-gray-300 mb-1.5">Имя *</label>
        <input id="pf-name" required value={name} onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="Как к вам обращаться" />
      </div>

      <div>
        <label htmlFor="pf-contact" className="block text-sm font-medium text-gray-300 mb-1.5">Телефон или Telegram *</label>
        <input id="pf-contact" required value={contact} onChange={(e) => setContact(e.target.value)}
          className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="+7 999 000-00-00 или @username" />
      </div>

      <div>
        <label htmlFor="pf-company" className="block text-sm font-medium text-gray-300 mb-1.5">Компания / проект</label>
        <input id="pf-company" value={company} onChange={(e) => setCompany(e.target.value)}
          className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          placeholder="Название" />
      </div>

      <div>
        <label htmlFor="pf-comment" className="block text-sm font-medium text-gray-300 mb-1.5">Что нужно сделать</label>
        <textarea id="pf-comment" value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
          className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-2.5 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          placeholder="Сайт, лендинг, интернет-магазин — коротко о задаче" />
      </div>

      <label className="flex items-start gap-2.5 text-xs text-gray-400 cursor-pointer select-none">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-gray-900" />
        <span>
          Согласен(на) на обработку персональных данных в соответствии с{" "}
          <Link href="/privacy" target="_blank" className="underline hover:text-gray-200">Политикой конфиденциальности</Link>.
        </span>
      </label>

      {status === "error" && (
        <p className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-2.5">{errorMessage}</p>
      )}

      <Button type="submit" disabled={status === "submitting"}
        className="w-full py-4 h-auto text-base font-semibold rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 text-white shadow-lg shadow-indigo-500/30 disabled:opacity-70">
        {status === "submitting" ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Отправляем...</>
        ) : (
          "Оставить заявку"
        )}
      </Button>
    </form>
  )
}

export default function PortfolioPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/landing" className="font-bold text-lg tracking-tight">Company24<span className="text-indigo-400">.pro</span></Link>
          <a href="#order" className="text-sm font-medium text-gray-300 hover:text-white transition-colors">Оставить заявку →</a>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-medium text-indigo-300 mb-6">
          <Sparkles className="w-3.5 h-3.5" /> Веб-разработка Company24.pro
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-5">Делаем сайты, которые решают задачу бизнеса</h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          От идеи до продакшена: сайты, лендинги и цифровые продукты с реальным контентом,
          аналитикой и автоматизацией — без шаблонных решений.
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-semibold mb-8">Наши работы</h2>
        <div className="grid md:grid-cols-2 gap-6">
          {CASES.map((c) => (
            <a key={c.slug} href={c.href} target="_blank" rel="noopener noreferrer"
              className="group block bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-700 transition-colors">
              <div className="relative aspect-[16/10] bg-gray-800 overflow-hidden">
                <Image src={c.image} alt={c.name} fill className="object-cover object-top group-hover:scale-[1.02] transition-transform duration-300" />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xl font-semibold">{c.name}</h3>
                  <ExternalLink className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
                </div>
                <p className="text-sm text-gray-400 mb-3">{c.tagline}</p>
                <p className="text-sm text-gray-500 mb-4">{c.description}</p>
                <div className="flex flex-wrap gap-2">
                  {c.tags.map((t) => (
                    <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-gray-800 text-gray-400 border border-gray-700">{t}</span>
                  ))}
                </div>
              </div>
            </a>
          ))}
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-gray-800 p-6 text-center text-gray-500 text-sm">
            Ваш проект может быть следующим
          </div>
        </div>
      </section>

      <section id="order" className="max-w-6xl mx-auto px-6 pb-24">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold mb-2">Обсудим ваш проект</h2>
          <p className="text-gray-400">Оставьте заявку — свяжемся и предложим решение под вашу задачу.</p>
        </div>
        <LeadForm />
      </section>

      <footer className="border-t border-gray-800 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
          <span>© {new Date().getFullYear()} Company24.pro</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-gray-300">Политика конфиденциальности</Link>
            <Link href="/landing" className="hover:text-gray-300">О платформе</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
