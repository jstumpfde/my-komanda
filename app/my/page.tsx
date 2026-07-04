"use client"

// Личная страница Юрия — все сервисы и роли платформы в одном месте.
// Owner-only (см. layout.tsx). Данные захардкожены намеренно: это не
// продуктовая фича с настройками для всех, а личный справочник одного
// конкретного человека.
import { useMemo, useState } from "react"
import {
  KeyRound, Search, ExternalLink, ArrowRight, Check,
  Briefcase, Radar, Phone, TrendingUp, Settings, Users, Handshake,
  type LucideIcon,
} from "lucide-react"

interface Account {
  email: string
  role: string
  note?: string
}

interface Service {
  key: string
  name: string
  desc: string
  url?: string
  loginUrl?: string
  loginLabel?: string
  accounts: Account[]
  sub?: string[]
  emptyNote?: string
  // Иконка-марка слева (44px, как в исходном личном лаунчере) — icon ИЛИ
  // markText (короткая надпись типа "HH"), не оба сразу.
  icon?: LucideIcon
  markText?: string
  markClass: string
  btnClass: string
}

const SECTIONS: { label: string; services: Service[] }[] = [
  {
    label: "Company24 · HR-платформа",
    services: [
      {
        key: "company24",
        name: "Company24",
        desc: "AI-найм и рекрутинг",
        url: "company24.pro",
        loginUrl: "https://company24.pro/admin-login",
        loginLabel: "Войти по ключу",
        icon: Briefcase,
        markClass: "bg-gradient-to-br from-violet-500 to-indigo-700",
        btnClass: "bg-violet-600 hover:bg-violet-500",
        accounts: [
          { email: "jstumpf.de@gmail.com", role: "Платформа-админ", note: "главный · passkey" },
          { email: "j.stumpf@yandex.ru", role: "Директор", note: "ИП Штумпф" },
          { email: "jstumpf@ya.by", role: "Директор", note: "ООО «ГК ОРЛИНК»" },
          { email: "j.stumpf@yandex.kz", role: "Клиент", note: "клиентский" },
          { email: "test-partner@company24.pro", role: "Партнёр", note: "Партнёр 1101" },
        ],
      },
    ],
  },
  {
    label: "MarketRadar · маркетинг SaaS",
    services: [
      {
        key: "marketradar",
        name: "MarketRadar",
        desc: "Аналитика конкурентов: отзывы (Google Maps/2GIS), SMM, сайты, инсайты, брендбук",
        url: "marketradar24.ru",
        loginUrl: "https://marketradar24.ru",
        icon: Radar,
        markClass: "bg-gradient-to-br from-teal-400 to-cyan-600",
        btnClass: "bg-teal-600 hover:bg-teal-500",
        sub: ["SEO-GEO", "Лендинги (land-pres)", "Контент-фабрика"],
        accounts: [
          { email: "jstumpf.de@gmail.com", role: "Админ" },
          { email: "admin@company24.pro", role: "Админ" },
          { email: "j.stumpf@yandex.ru", role: "Клиент" },
          { email: "j.stumpf@ya.ru", role: "Клиент" },
          { email: "j.stumpf@yandex.by", role: "Клиент" },
          { email: "stumpfik@mail.ru", role: "Клиент" },
        ],
      },
    ],
  },
  {
    label: "Отдельные продукты",
    services: [
      {
        key: "call-agent",
        name: "Call-Agent",
        desc: "AI-анализ звонков/чатов/встреч ОП: оценки, коучинг, Битрикс/amoCRM",
        url: "marketradar24.ru/call-agent",
        loginUrl: "https://marketradar24.ru/call-agent/",
        icon: Phone,
        markClass: "bg-gradient-to-br from-amber-400 to-orange-600",
        btnClass: "bg-orange-600 hover:bg-orange-500",
        accounts: [
          { email: "jstumpf.de@gmail.com", role: "Owner", note: "Орлинк" },
          { email: "admin@company24.ru", role: "Owner", note: "Орлинк" },
          { email: "owner@orlink.ru", role: "Owner", note: "Орлинк" },
        ],
      },
      {
        key: "leadgen",
        name: "Leadgen",
        desc: "Лидогенерация: сбор компаний по ИНН/сегментам, обогащение, воронки",
        icon: TrendingUp,
        markClass: "bg-gradient-to-br from-emerald-400 to-green-600",
        btnClass: "bg-emerald-600 hover:bg-emerald-500",
        accounts: [
          { email: "jstumpf.de@gmail.com", role: "Platform", note: "полный доступ" },
          { email: "admin", role: "Client", note: "MarketRadar24" },
        ],
        emptyNote: "адрес входа пока не задан",
      },
      {
        key: "hh-parser",
        name: "HH Parser",
        desc: "Парсер hh.ru: сбор кандидатов/лидов",
        url: "marketradar24.ru/parser",
        loginUrl: "https://marketradar24.ru/parser/",
        markText: "HH",
        markClass: "bg-gradient-to-br from-red-500 to-rose-700",
        btnClass: "bg-rose-600 hover:bg-rose-500",
        accounts: [
          { email: "jstumpf.de@gmail.com", role: "Админ", note: "единственный" },
        ],
      },
    ],
  },
  {
    label: "Служебное",
    services: [
      {
        key: "admin-panel",
        name: "Админ-панель",
        desc: "Управление всеми продуктами и клиентами",
        url: "radar.company24.pro/admin",
        loginUrl: "https://radar.company24.pro/admin",
        icon: Settings,
        markClass: "bg-gradient-to-br from-sky-400 to-blue-600",
        btnClass: "bg-sky-600 hover:bg-sky-500",
        accounts: [
          { email: "jstumpf.de@gmail.com", role: "Админ" },
        ],
      },
      {
        key: "clients",
        name: "Клиенты (все компании)",
        desc: "Список всех компаний-клиентов Company24 — открой любую и нажми «Войти как клиент», чтобы попасть в её кабинет",
        url: "company24.pro/admin/clients",
        loginUrl: "https://company24.pro/admin/clients",
        icon: Users,
        markClass: "bg-gradient-to-br from-fuchsia-400 to-purple-600",
        btnClass: "bg-fuchsia-600 hover:bg-fuchsia-500",
        accounts: [],
        emptyNote: "не отдельный аккаунт — жмёшь «Войти» и выбираешь компанию на месте",
      },
      {
        key: "partner",
        name: "Партнёры",
        desc: "Партнёрская программа · кабинет партнёра",
        url: "company24.pro/partner",
        loginUrl: "https://company24.pro/partner",
        icon: Handshake,
        markClass: "bg-gradient-to-br from-pink-400 to-rose-600",
        btnClass: "bg-pink-600 hover:bg-pink-500",
        accounts: [],
        emptyNote: "аккаунтов пока нет",
      },
    ],
  },
]

const ROLE_STYLES: Record<string, string> = {
  "Платформа-админ": "bg-violet-500/10 text-violet-600 border-violet-500/30",
  "Директор": "bg-indigo-500/10 text-indigo-600 border-indigo-500/30",
  "Клиент": "bg-sky-500/10 text-sky-600 border-sky-500/30",
  "Партнёр": "bg-amber-500/10 text-amber-600 border-amber-500/30",
  "Владелец": "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  "Owner": "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  "Админ": "bg-pink-500/10 text-pink-600 border-pink-500/30",
  "Platform": "bg-violet-500/10 text-violet-600 border-violet-500/30",
  "Client": "bg-sky-500/10 text-sky-600 border-sky-500/30",
}

function roleClass(role: string) {
  return ROLE_STYLES[role] ?? "bg-muted text-muted-foreground border-border"
}

// Одна кнопка на аккаунт: копирует email И сразу открывает вкладку входа —
// чтобы в открывшейся форме сразу вставить email (Cmd+V), без лишнего шага.
function AccountEnterButton({ email, loginUrl }: { email: string; loginUrl?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(email)
        setDone(true)
        setTimeout(() => setDone(false), 1200)
        if (loginUrl) window.open(loginUrl, "_blank", "noopener,noreferrer")
      }}
      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title="Скопировать email и открыть вход"
    >
      {done ? <Check className="w-3 h-3 text-emerald-500" /> : <ArrowRight className="w-3 h-3" />}
      {done ? "Скопировано" : "Войти"}
    </button>
  )
}

export default function MyPage() {
  const [q, setQ] = useState("")

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return SECTIONS
    return SECTIONS.map((section) => ({
      ...section,
      services: section.services.filter((svc) => {
        const haystack = [svc.name, svc.desc, svc.url, ...(svc.sub ?? []), ...svc.accounts.flatMap((a) => [a.email, a.role, a.note ?? ""])]
          .join(" ")
          .toLowerCase()
        return haystack.includes(term)
      }),
    })).filter((section) => section.services.length > 0)
  }, [q])

  const totalAccounts = SECTIONS.flatMap((s) => s.services).reduce((n, svc) => n + svc.accounts.length, 0)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2">
          Личный доступ · только мои аккаунты
        </p>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Мои сервисы</h1>
          <span className="text-xs font-mono text-slate-500">
            {totalAccounts} логинов · {SECTIONS.flatMap((s) => s.services).length} продуктов
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-400 leading-relaxed">
          Кнопка «Войти» у аккаунта копирует email и сразу открывает вкладку входа — остаётся вставить (Cmd+V) и ввести пароль.
        </p>

        <div className="relative mt-5 mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по продукту, логину, роли…"
            className="w-full rounded-xl border border-slate-800 bg-slate-900 py-3 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
          />
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-10">Ничего не найдено</p>
        )}

        {filtered.map((section) => (
          <div key={section.label} className="mb-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 whitespace-nowrap">
                {section.label}
              </span>
              <span className="h-px flex-1 bg-slate-800" />
            </div>

            <div className="space-y-3">
              {section.services.map((svc) => {
                const Icon = svc.icon
                return (
                <div key={svc.key} className="rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 overflow-hidden">
                  <div className="flex items-center gap-3.5 p-4">
                    <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm ${svc.markClass}`}>
                      {Icon ? <Icon className="w-5 h-5" /> : svc.markText}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold tracking-tight">{svc.name}</div>
                      <div className="text-xs text-slate-500 mt-0.5 leading-snug">{svc.desc}</div>
                      {svc.url && <div className="text-[11px] font-mono text-slate-500 mt-1 truncate">{svc.url}</div>}
                    </div>
                    {svc.loginUrl ? (
                      <a
                        href={svc.loginUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white transition-colors ${svc.btnClass}`}
                      >
                        {svc.loginLabel === "Войти по ключу" && <KeyRound className="w-3.5 h-3.5" />}
                        {svc.loginLabel ?? "Войти"}
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-600 border border-dashed border-slate-700 rounded-lg px-3 py-2">
                        {svc.emptyNote ?? "адрес?"}
                      </span>
                    )}
                  </div>

                  {svc.sub && (
                    <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                      <span className="text-[11px] text-slate-500">Внутри (общий аккаунт):</span>
                      {svc.sub.map((s) => (
                        <span key={s} className="text-[11px] text-slate-300 bg-white/5 border border-slate-800 rounded-full px-2 py-0.5">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  {svc.accounts.length > 0 ? (
                    <div className="border-t border-slate-800">
                      {svc.accounts.map((acc, i) => (
                        <div
                          key={acc.email + i}
                          className="flex items-center gap-2.5 px-4 py-2 border-t border-white/5 first:border-t-0 hover:bg-white/5 transition-colors"
                        >
                          <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${roleClass(acc.role)}`}>
                            {acc.role}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-mono text-[13px] truncate">{acc.email}</span>
                            {acc.note && <span className="block text-[11px] text-slate-500">{acc.note}</span>}
                          </span>
                          <AccountEnterButton email={acc.email} loginUrl={svc.loginUrl} />
                        </div>
                      ))}
                    </div>
                  ) : svc.emptyNote && svc.accounts.length === 0 ? (
                    <div className="px-4 pb-3 text-xs text-slate-600 italic border-t border-slate-800 pt-3">
                      {svc.emptyNote}
                    </div>
                  ) : null}
                </div>
                )
              })}
            </div>
          </div>
        ))}

        <div className="mt-8 flex gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="shrink-0 w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <KeyRound className="w-4 h-4" />
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Passkey сейчас настроен на <span className="text-slate-200 font-medium">Company24</span> и{" "}
            <span className="text-slate-200 font-medium">MarketRadar</span>. Для остальных — вход паролем.
          </p>
        </div>

        <p className="mt-6 text-center text-[11px] text-slate-600">company24.pro/my · видно только тебе</p>
      </div>
    </div>
  )
}
