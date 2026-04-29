"use client"

import {
  Phone, Mail, MapPin, Briefcase, GraduationCap, Globe2, Plane,
  DollarSign, Calendar, ExternalLink,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

// ─── Types — описывают только нужные поля сырого hh resume ────────────────────

interface HhContact {
  type?: { id?: string; name?: string }
  value?: string | { formatted?: string; email?: string; number?: string; country?: string; city?: string }
}

interface HhExperience {
  start?: string
  end?: string | null
  company?: string
  position?: string
  industries?: { name?: string }[]
  description?: string
}

interface HhEducation {
  name?: string
  organization?: string
  result?: string
  year?: number | string
}

interface HhResume {
  first_name?: string
  last_name?: string
  middle_name?: string
  age?: number
  gender?: { id?: string; name?: string }
  area?: { name?: string }
  citizenship?: { name?: string }[]
  travel_time?: { id?: string; name?: string }
  relocation?: { type?: { id?: string; name?: string } }
  business_trip_readiness?: { id?: string; name?: string }
  total_experience?: { months?: number }
  experience?: HhExperience[]
  education?: { primary?: HhEducation[]; level?: { id?: string; name?: string } }
  contact?: HhContact[]
  salary?: { amount?: number; currency?: string }
  alternate_url?: string
  schedules?: { id?: string; name?: string }[]
  employments?: { id?: string; name?: string }[]
}

interface HhRawData {
  resume?: HhResume
}

interface HhResumeInfoProps {
  rawData: unknown
  // Fallback на наши собственные поля кандидата
  fallback: {
    phone: string | null
    email: string | null
    city: string | null
    experience: string | null
    salaryMin: number | null
    salaryMax: number | null
  }
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function monthsToText(months: number | undefined): string | null {
  if (!months || months <= 0) return null
  const years = Math.floor(months / 12)
  const m = months % 12
  if (years === 0) return `${m} мес.`
  if (m === 0) return `${years} ${years === 1 ? "год" : years < 5 ? "года" : "лет"}`
  return `${years} ${years === 1 ? "год" : years < 5 ? "года" : "лет"} ${m} мес.`
}

function formatYearMonth(date: string | undefined | null): string {
  if (!date) return ""
  const d = new Date(date)
  if (isNaN(d.getTime())) return date
  return d.toLocaleDateString("ru-RU", { month: "short", year: "numeric" })
}

function getContact(contacts: HhContact[] | undefined, id: string): string | null {
  if (!Array.isArray(contacts)) return null
  for (const c of contacts) {
    if (c?.type?.id !== id) continue
    const v = c.value
    if (typeof v === "string") return v
    if (v && typeof v === "object") {
      if (id === "email" && typeof v.email === "string") return v.email
      if (typeof v.formatted === "string") return v.formatted
      if (typeof v.number === "string") return v.number
    }
  }
  return null
}

function formatSalaryRange(min: number | null, max: number | null, currency?: string): string | null {
  const cur = currency === "RUR" || currency === "RUB" || !currency ? "₽" : currency
  if (min && max && min !== max) return `${min.toLocaleString("ru-RU")} – ${max.toLocaleString("ru-RU")} ${cur}`
  const v = min ?? max
  return v ? `${v.toLocaleString("ru-RU")} ${cur}` : null
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{children}</h3>
}

function Row({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-muted-foreground">
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function HhResumeInfo({ rawData, fallback }: HhResumeInfoProps) {
  const raw = (rawData && typeof rawData === "object" ? rawData : {}) as HhRawData
  const resume = raw.resume

  const fullName = [resume?.last_name, resume?.first_name, resume?.middle_name].filter(Boolean).join(" ").trim()
  const age = resume?.age
  const gender = resume?.gender?.name
  const city = resume?.area?.name ?? fallback.city
  const phone = getContact(resume?.contact, "cell") ?? fallback.phone
  const email = getContact(resume?.contact, "email") ?? fallback.email
  const totalExp = monthsToText(resume?.total_experience?.months) ?? fallback.experience
  const lastExp = Array.isArray(resume?.experience) ? resume!.experience![0] : undefined
  const educationLevel = resume?.education?.level?.name
  const primaryEducation = Array.isArray(resume?.education?.primary) ? resume!.education!.primary : []
  const citizenship = Array.isArray(resume?.citizenship)
    ? resume!.citizenship!.map((c) => c?.name).filter(Boolean).join(", ")
    : ""
  const relocation = resume?.relocation?.type?.name
  const businessTrip = resume?.business_trip_readiness?.name
  const schedules = Array.isArray(resume?.schedules) ? resume!.schedules!.map((s) => s?.name).filter(Boolean) : []
  const employments = Array.isArray(resume?.employments) ? resume!.employments!.map((e) => e?.name).filter(Boolean) : []
  const salary = formatSalaryRange(
    resume?.salary?.amount ?? fallback.salaryMin,
    resume?.salary?.amount ?? fallback.salaryMax,
    resume?.salary?.currency,
  )

  return (
    <div className="space-y-5">
      {/* ── Личное ──────────────────────────────────────────────────────────── */}
      {(fullName || age || gender || resume?.alternate_url) && (
        <section className="space-y-1.5">
          <SectionHeader>Личное</SectionHeader>
          {fullName && (
            <p className="text-sm font-medium text-foreground">{fullName}</p>
          )}
          {(age != null || gender) && (
            <p className="text-xs text-muted-foreground">
              {age != null ? `${age} лет` : ""}
              {age != null && gender ? " · " : ""}
              {gender ?? ""}
            </p>
          )}
          {resume?.alternate_url && (
            <a
              href={resume.alternate_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              Резюме на hh.ru
            </a>
          )}
        </section>
      )}

      {/* ── Контакты ─────────────────────────────────────────────────────────── */}
      <section className="space-y-1.5">
        <SectionHeader>Контакты</SectionHeader>
        {phone ? (
          <a href={`tel:${phone}`} className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
            <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {phone}
          </a>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground/50">
            <Phone className="w-3.5 h-3.5 shrink-0" />
            Телефон не указан
          </div>
        )}
        {email ? (
          <a href={`mailto:${email}`} className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
            <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            {email}
          </a>
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground/50">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            Email не указан
          </div>
        )}
        {city && <Row icon={MapPin}>{city}</Row>}
      </section>

      {/* ── Опыт ────────────────────────────────────────────────────────────── */}
      {(totalExp || lastExp) && (
        <section className="space-y-2">
          <SectionHeader>Опыт работы</SectionHeader>
          {totalExp && (
            <Row icon={Briefcase}>
              <span className="text-foreground font-medium">{totalExp}</span>
              <span className="text-muted-foreground"> · общий стаж</span>
            </Row>
          )}
          {lastExp && (
            <div className="p-2.5 rounded-lg border border-border/60 bg-muted/40 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="w-3 h-3 shrink-0" />
                {formatYearMonth(lastExp.start)} — {lastExp.end ? formatYearMonth(lastExp.end) : "по н.в."}
              </div>
              {lastExp.company && (
                <p className="text-sm font-medium text-foreground">{lastExp.company}</p>
              )}
              {lastExp.position && (
                <p className="text-sm text-muted-foreground">{lastExp.position}</p>
              )}
              {lastExp.description && (
                <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                  {lastExp.description.replace(/<[^>]+>/g, "")}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── Образование ─────────────────────────────────────────────────────── */}
      {(educationLevel || primaryEducation.length > 0) && (
        <section className="space-y-1.5">
          <SectionHeader>Образование</SectionHeader>
          {educationLevel && (
            <Row icon={GraduationCap}>
              <span className="text-foreground">{educationLevel}</span>
            </Row>
          )}
          {primaryEducation.slice(0, 3).map((ed, i) => (
            <div key={i} className="text-xs text-muted-foreground pl-5">
              {ed.name ?? ed.organization}
              {ed.result ? ` · ${ed.result}` : ""}
              {ed.year ? ` (${ed.year})` : ""}
            </div>
          ))}
        </section>
      )}

      {/* ── Зарплата и условия ──────────────────────────────────────────────── */}
      {(salary || schedules.length > 0 || employments.length > 0) && (
        <section className="space-y-1.5">
          <SectionHeader>Условия</SectionHeader>
          {salary && <Row icon={DollarSign}>{salary}</Row>}
          {employments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {employments.map((e) => (
                <Badge key={e} variant="secondary" className="text-[10px] font-normal">{e}</Badge>
              ))}
            </div>
          )}
          {schedules.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {schedules.map((s) => (
                <Badge key={s} variant="outline" className="text-[10px] font-normal">{s}</Badge>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Прочее ──────────────────────────────────────────────────────────── */}
      {(citizenship || relocation || businessTrip) && (
        <section className="space-y-1.5">
          <SectionHeader>Дополнительно</SectionHeader>
          {citizenship && <Row icon={Globe2}>Гражданство: <span className="text-foreground">{citizenship}</span></Row>}
          {relocation && <Row icon={MapPin}>Переезд: <span className="text-foreground">{relocation}</span></Row>}
          {businessTrip && <Row icon={Plane}>Командировки: <span className="text-foreground">{businessTrip}</span></Row>}
        </section>
      )}
    </div>
  )
}
