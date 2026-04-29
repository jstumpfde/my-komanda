"use client"

import {
  Phone, Mail, MapPin, Briefcase, GraduationCap, Globe2, Plane,
  DollarSign, Calendar, ExternalLink, Languages, Wrench,
  Car, Award, Link2, Clock,
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
  area?: { name?: string }
  industry?: { name?: string }
  industries?: { name?: string }[]
  description?: string
}

interface HhEducation {
  name?: string
  organization?: string
  result?: string
  year?: number | string
}

interface HhLanguage {
  id?: string
  name?: string
  level?: { id?: string; name?: string }
}

interface HhRecommendation {
  name?: string
  organization?: string
  position?: string
  contact?: string
}

interface HhPortfolio {
  small?: { path?: string }
  medium?: { path?: string }
  description?: string
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
  relocation?: { type?: { id?: string; name?: string }; area?: { name?: string }[] }
  business_trip_readiness?: { id?: string; name?: string }
  total_experience?: { months?: number }
  experience?: HhExperience[]
  education?: { primary?: HhEducation[]; additional?: HhEducation[]; level?: { id?: string; name?: string } }
  contact?: HhContact[]
  salary?: { amount?: number; currency?: string }
  alternate_url?: string
  schedules?: { id?: string; name?: string }[]
  employments?: { id?: string; name?: string }[]
  language?: HhLanguage[]
  skill_set?: string[]
  skills?: string
  title?: string
  driver_license_types?: { id?: string }[]
  has_vehicle?: boolean
  recommendation?: HhRecommendation[]
  portfolio?: HhPortfolio[]
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

function ExperienceCard({ exp }: { exp: HhExperience }) {
  // hh возвращает HTML с <li>, <p>, <br>. Разворачиваем в plain-text
  // с переносами строк, чтобы whitespace-pre-wrap отрисовал список.
  const cleanDescription = exp.description
    ? exp.description
        .replace(/<\/?(p|div|li|ul|ol|h[1-6])[^>]*>/gi, "\n")
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : ""
  const areaName = exp.area?.name
  const industryNames = [
    exp.industry?.name,
    ...(Array.isArray(exp.industries) ? exp.industries.map((i) => i?.name) : []),
  ].filter((s): s is string => typeof s === "string" && s.length > 0)
  const uniqueIndustries = Array.from(new Set(industryNames))

  return (
    <div className="p-2.5 rounded-lg border border-border/60 bg-muted/40 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="w-3 h-3 shrink-0" />
        <span>
          {formatYearMonth(exp.start)} — {exp.end ? formatYearMonth(exp.end) : "по н.в."}
        </span>
      </div>
      {exp.company && (
        <p className="text-sm font-medium text-foreground break-words">{exp.company}</p>
      )}
      {exp.position && (
        <p className="text-sm text-muted-foreground break-words">{exp.position}</p>
      )}
      {(areaName || uniqueIndustries.length > 0) && (
        <p className="text-[11px] text-muted-foreground/80 break-words">
          {[areaName, ...uniqueIndustries].filter(Boolean).join(" · ")}
        </p>
      )}
      {cleanDescription && (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words pt-1">
          {cleanDescription}
        </p>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function HhResumeInfo({ rawData, fallback }: HhResumeInfoProps) {
  const raw = (rawData && typeof rawData === "object" ? rawData : {}) as HhRawData
  // Иногда raw_data — это сам resume (без вложенного ключа resume).
  const resume: HhResume | undefined = raw.resume
    ?? (raw && typeof raw === "object" && ("contact" in raw || "experience" in raw || "education" in raw)
      ? (raw as unknown as HhResume)
      : undefined)

  const fullName = [resume?.last_name, resume?.first_name, resume?.middle_name].filter(Boolean).join(" ").trim()
  const age = resume?.age
  const gender = resume?.gender?.name
  const city = resume?.area?.name ?? fallback.city
  const phone = getContact(resume?.contact, "cell") ?? fallback.phone
  const email = getContact(resume?.contact, "email") ?? fallback.email
  const totalExp = monthsToText(resume?.total_experience?.months) ?? fallback.experience
  const allExperiences = Array.isArray(resume?.experience) ? resume!.experience! : []
  const educationLevel = resume?.education?.level?.name
  const primaryEducation = Array.isArray(resume?.education?.primary) ? resume!.education!.primary : []
  const additionalEducation = Array.isArray(resume?.education?.additional) ? resume!.education!.additional : []
  const citizenship = Array.isArray(resume?.citizenship)
    ? resume!.citizenship!.map((c) => c?.name).filter(Boolean).join(", ")
    : ""
  const relocation = resume?.relocation?.type?.name
  const businessTrip = resume?.business_trip_readiness?.name
  const schedules = Array.isArray(resume?.schedules) ? resume!.schedules!.map((s) => s?.name).filter(Boolean) : []
  const employments = Array.isArray(resume?.employments) ? resume!.employments!.map((e) => e?.name).filter(Boolean) : []
  const languages = Array.isArray(resume?.language) ? resume!.language!.filter(l => l?.name) : []
  const skillSet = Array.isArray(resume?.skill_set) ? resume!.skill_set!.filter(Boolean) : []
  const skillsText = typeof resume?.skills === "string" ? resume!.skills!.trim() : ""
  const desiredPosition = typeof resume?.title === "string" ? resume!.title!.trim() : ""
  const travelTime = resume?.travel_time?.name
  const driverLicenses = Array.isArray(resume?.driver_license_types)
    ? resume!.driver_license_types!.map((d) => d?.id).filter((s): s is string => typeof s === "string" && s.length > 0)
    : []
  const hasVehicle = resume?.has_vehicle === true
  const recommendations = Array.isArray(resume?.recommendation) ? resume!.recommendation!.filter(Boolean) : []
  const portfolio = Array.isArray(resume?.portfolio) ? resume!.portfolio!.filter(Boolean) : []
  const relocationAreas = Array.isArray(resume?.relocation?.area)
    ? resume!.relocation!.area!.map((a) => a?.name).filter((s): s is string => typeof s === "string" && s.length > 0)
    : []

  const salary = formatSalaryRange(
    resume?.salary?.amount ?? fallback.salaryMin,
    resume?.salary?.amount ?? fallback.salaryMax,
    resume?.salary?.currency,
  )

  const hasContacts = !!(phone || email || city)

  return (
    <div className="space-y-5">
      {/* ── Личное ──────────────────────────────────────────────────────────── */}
      {(fullName || age || gender || resume?.alternate_url || desiredPosition) && (
        <section className="space-y-1.5">
          <SectionHeader>Личное</SectionHeader>
          {fullName && (
            <p className="text-sm font-medium text-foreground break-words">{fullName}</p>
          )}
          {desiredPosition && (
            <p className="text-xs text-muted-foreground break-words">Желаемая должность: {desiredPosition}</p>
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
      {hasContacts && (
        <section className="space-y-1.5">
          <SectionHeader>Контакты</SectionHeader>
          {phone && (
            <a href={`tel:${phone}`} className="flex items-center gap-2 text-sm hover:text-primary transition-colors break-all">
              <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {phone}
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="flex items-center gap-2 text-sm hover:text-primary transition-colors break-all">
              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {email}
            </a>
          )}
          {city && <Row icon={MapPin}>{city}</Row>}
        </section>
      )}

      {/* ── Опыт работы (ВСЕ места) ─────────────────────────────────────────── */}
      {(totalExp || allExperiences.length > 0) && (
        <section className="space-y-2">
          <SectionHeader>Опыт работы</SectionHeader>
          {totalExp && (
            <Row icon={Briefcase}>
              <span className="text-foreground font-medium">{totalExp}</span>
              <span className="text-muted-foreground"> · общий стаж</span>
            </Row>
          )}
          {allExperiences.length > 0 && (
            <div className="space-y-1.5">
              {allExperiences.map((exp, i) => (
                <ExperienceCard key={i} exp={exp} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Образование (всё) ──────────────────────────────────────────────── */}
      {(educationLevel || primaryEducation.length > 0 || additionalEducation.length > 0) && (
        <section className="space-y-1.5">
          <SectionHeader>Образование</SectionHeader>
          {educationLevel && (
            <Row icon={GraduationCap}>
              <span className="text-foreground">{educationLevel}</span>
            </Row>
          )}
          {primaryEducation.map((ed, i) => (
            <div key={`p-${i}`} className="text-xs text-muted-foreground pl-5 break-words">
              <span className="text-foreground">{ed.name ?? ed.organization}</span>
              {ed.result ? ` · ${ed.result}` : ""}
              {ed.year ? ` (${ed.year})` : ""}
            </div>
          ))}
          {additionalEducation.length > 0 && (
            <div className="pl-5 pt-1 space-y-0.5">
              <p className="text-[10px] uppercase text-muted-foreground/70 tracking-wide">Доп. образование</p>
              {additionalEducation.map((ed, i) => (
                <div key={`a-${i}`} className="text-xs text-muted-foreground break-words">
                  <span className="text-foreground">{ed.name ?? ed.organization}</span>
                  {ed.result ? ` · ${ed.result}` : ""}
                  {ed.year ? ` (${ed.year})` : ""}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Языки ───────────────────────────────────────────────────────────── */}
      {languages.length > 0 && (
        <section className="space-y-1.5">
          <SectionHeader>Языки</SectionHeader>
          <div className="space-y-1">
            {languages.map((l, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Languages className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <span className="text-foreground">{l.name}</span>
                  {l.level?.name ? <span className="text-muted-foreground"> — {l.level.name}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Навыки ──────────────────────────────────────────────────────────── */}
      {(skillSet.length > 0 || skillsText) && (
        <section className="space-y-1.5">
          <SectionHeader>Навыки</SectionHeader>
          {skillSet.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {skillSet.map((s, i) => (
                <Badge key={`${s}-${i}`} variant="secondary" className="text-[10px] font-normal break-words">{s}</Badge>
              ))}
            </div>
          )}
          {skillsText && (
            <Row icon={Wrench}>
              <span className="text-foreground whitespace-pre-wrap break-words">{skillsText}</span>
            </Row>
          )}
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

      {/* ── Готовность к переезду / командировкам ────────────────────────── */}
      {(citizenship || relocation || relocationAreas.length > 0 || businessTrip || travelTime) && (
        <section className="space-y-1.5">
          <SectionHeader>Готовность</SectionHeader>
          {citizenship && <Row icon={Globe2}>Гражданство: <span className="text-foreground">{citizenship}</span></Row>}
          {relocation && (
            <Row icon={MapPin}>
              Переезд: <span className="text-foreground">{relocation}</span>
              {relocationAreas.length > 0 && (
                <span className="text-muted-foreground"> · {relocationAreas.join(", ")}</span>
              )}
            </Row>
          )}
          {businessTrip && <Row icon={Plane}>Командировки: <span className="text-foreground">{businessTrip}</span></Row>}
          {travelTime && <Row icon={Clock}>Время в пути: <span className="text-foreground">{travelTime}</span></Row>}
        </section>
      )}

      {/* ── Транспорт ───────────────────────────────────────────────────── */}
      {(driverLicenses.length > 0 || hasVehicle) && (
        <section className="space-y-1.5">
          <SectionHeader>Транспорт</SectionHeader>
          {driverLicenses.length > 0 && (
            <Row icon={Car}>
              Водительские права:{" "}
              <span className="text-foreground">{driverLicenses.join(", ")}</span>
            </Row>
          )}
          {hasVehicle && <Row icon={Car}>Есть личный автомобиль</Row>}
        </section>
      )}

      {/* ── Рекомендации ────────────────────────────────────────────────── */}
      {recommendations.length > 0 && (
        <section className="space-y-1.5">
          <SectionHeader>Рекомендации</SectionHeader>
          <div className="space-y-1.5">
            {recommendations.map((r, i) => {
              const lines = [r.name, r.position, r.organization].filter(Boolean) as string[]
              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Award className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0 break-words">
                    {lines.length > 0 ? (
                      <p className="text-foreground">{lines.join(" · ")}</p>
                    ) : null}
                    {r.contact && (
                      <p className="text-xs text-muted-foreground break-all">{r.contact}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Портфолио ───────────────────────────────────────────────────── */}
      {portfolio.length > 0 && (
        <section className="space-y-1.5">
          <SectionHeader>Портфолио</SectionHeader>
          <div className="flex flex-wrap gap-1.5">
            {portfolio.map((p, i) => {
              const path = p.medium?.path ?? p.small?.path
              if (!path) return null
              return (
                <a
                  key={i}
                  href={path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Link2 className="w-3 h-3" />
                  {p.description?.trim() || `Работа ${i + 1}`}
                </a>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
