"use client"

import {
  Phone, Mail, MapPin, Briefcase, GraduationCap, Globe2, Plane,
  DollarSign, Calendar, ExternalLink, Languages, Wrench,
  Car, Award, Link2, Clock, Send, MessageSquare,
  Lock, Train, Globe, FileBadge,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"

// ─── Types — описывают только нужные поля сырого hh resume ────────────────────
//
// hh API отдаёт два формата резюме: «preview» в /negotiations (без контактов,
// языков, навыков и т.д.) и «full» в /resumes/{id} (со всем). Этот компонент
// рендерит ВСЕ поля, что встречаются в обоих форматах — секции автоматически
// скрываются, если данных нет.

interface HhContactValue {
  formatted?: string
  email?: string
  number?: string
  country?: string
  city?: string
  comment?: string
}

interface HhContact {
  type?: { id?: string; name?: string }
  value?: string | HhContactValue
  preferred?: boolean
  comment?: string
  need_verification?: boolean
  verified?: boolean
}

interface HhSite {
  type?: { id?: string; name?: string }
  url?: string
}

interface HhEmployer {
  id?: string
  name?: string
  url?: string
  alternate_url?: string
  logo_urls?: { original?: string; "240"?: string; "90"?: string }
}

interface HhExperience {
  start?: string
  end?: string | null
  company?: string
  company_url?: string
  position?: string
  area?: { name?: string }
  industry?: { name?: string }
  industries?: { name?: string }[]
  employer?: HhEmployer
  // hh API основное поле — description (HTML с <li>/<p>/<br>),
  // но в исторических импортах и ручных дампах встречаются альтернативы
  description?: string
  responsibility?: string
  responsibilities?: string
  achievements?: string
  tasks?: string
  content?: string
  body?: string
  text?: string
}

interface HhEducation {
  name?: string
  organization?: string
  result?: string
  year?: number | string
  university_acronym?: string
}

interface HhAttestation {
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
  large?: { path?: string }
  description?: string
}

interface HhCertificate {
  title?: string
  achieved_at?: string
  url?: string
  type?: string
  owner?: string
}

interface HhPhoto {
  small?: string
  medium?: string
  "100"?: string
  "240"?: string
}

interface HhHiddenField { id?: string; name?: string }

interface HhResume {
  first_name?: string
  last_name?: string
  middle_name?: string
  age?: number
  birth_date?: string
  gender?: { id?: string; name?: string }
  area?: { name?: string }
  metro?: { name?: string; line?: { name?: string } }
  citizenship?: { name?: string }[]
  work_ticket?: { name?: string }[]
  travel_time?: { id?: string; name?: string }
  relocation?: {
    type?: { id?: string; name?: string }
    area?: { name?: string }[]
    city_list?: { name?: string }[]
  }
  business_trip_readiness?: { id?: string; name?: string }
  total_experience?: { months?: number }
  experience?: HhExperience[]
  education?: {
    primary?: HhEducation[]
    additional?: HhEducation[]
    attestation?: HhAttestation[]
    level?: { id?: string; name?: string }
  }
  contact?: HhContact[]
  site?: HhSite[]
  salary?: { amount?: number; currency?: string }
  alternate_url?: string
  schedules?: { id?: string; name?: string }[]
  employments?: { id?: string; name?: string }[]
  work_format?: { id?: string; name?: string }[]
  employment_form?: { id?: string; name?: string }[]
  language?: HhLanguage[]
  skill_set?: string[]
  skills?: string
  title?: string
  driver_license_types?: { id?: string }[]
  has_vehicle?: boolean
  recommendation?: HhRecommendation[]
  portfolio?: HhPortfolio[]
  certificate?: HhCertificate[]
  hidden_fields?: HhHiddenField[]
  photo?: HhPhoto | null
  preferred_communication_method?: { id?: string; name?: string }
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

// Достаёт строку по нескольким альтернативным ключам (snake/camel/русские).
// Используется для устойчивости к разным версиям hh API и ручных дампов.
function pickStr(obj: unknown, ...keys: string[]): string {
  if (!obj || typeof obj !== "object") return ""
  const o = obj as Record<string, unknown>
  for (const k of keys) {
    const v = o[k]
    if (typeof v === "string" && v.trim().length > 0) return v.trim()
  }
  return ""
}

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

function formatYear(date: string | undefined | null): string {
  if (!date) return ""
  const d = new Date(date)
  if (isNaN(d.getTime())) return date
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
}

function ageWord(years: number): string {
  const last2 = years % 100
  if (last2 >= 11 && last2 <= 14) return "лет"
  switch (years % 10) {
    case 1: return "год"
    case 2:
    case 3:
    case 4: return "года"
    default: return "лет"
  }
}

function computeAge(birthDate: string | undefined): number | null {
  if (!birthDate) return null
  const d = new Date(birthDate)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let years = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--
  return years > 0 && years < 120 ? years : null
}

// Извлекает контакт по типу. Возвращает { value } если найден и не пустой,
// или { hidden: true } если контакт скрыт кандидатом, или null если нет.
type ContactResult = { value: string } | { hidden: true } | null

function getContact(
  contacts: HhContact[] | undefined,
  ids: string[],
  hiddenIds: string[],
  hiddenFields: Set<string>,
): ContactResult {
  // Скрыт через resume.hidden_fields — на этот хук смотрим первым.
  for (const hid of hiddenIds) {
    if (hiddenFields.has(hid)) return { hidden: true }
  }
  if (!Array.isArray(contacts)) return null
  for (const c of contacts) {
    const cid = c?.type?.id
    if (!cid || !ids.includes(cid)) continue
    const v = c.value
    if (typeof v === "string") {
      const s = v.trim()
      if (s.length > 0) return { value: s }
    } else if (v && typeof v === "object") {
      const s =
        (typeof v.email === "string" && v.email.trim()) ||
        (typeof v.formatted === "string" && v.formatted.trim()) ||
        (typeof v.number === "string" && v.number.trim()) ||
        ""
      if (s) return { value: s }
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

function cleanHtml(raw: string | undefined): string {
  if (!raw) return ""
  return raw
    .replace(/<\/?(p|div|li|ul|ol|h[1-6])[^>]*>/gi, "\n")
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pb-1 border-b border-border/40">
      {children}
    </h3>
  )
}

function Row({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm text-muted-foreground">
      <Icon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

// Ряд для скрытых контактов: серый, italic, иконка замка.
function HiddenContactRow({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground/60 italic">
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}:</span>
      <Lock className="w-3 h-3 shrink-0" />
      <span>скрыт кандидатом</span>
    </div>
  )
}

function ExperienceCard({ exp }: { exp: HhExperience }) {
  // hh возвращает HTML с <li>, <p>, <br>. Разворачиваем в plain-text
  // с переносами строк, чтобы whitespace-pre-wrap отрисовал список.
  // Поле описания в свежем hh API — description, но у части кандидатов
  // (ручной импорт, старая версия sync-а) текст лежит в responsibility,
  // achievements, tasks или generic content/body/text. Берём первый
  // непустой источник.
  const rawDesc =
    exp.description ||
    exp.responsibility ||
    exp.responsibilities ||
    exp.achievements ||
    exp.tasks ||
    exp.content ||
    exp.body ||
    exp.text ||
    ""
  const cleanDescription = cleanHtml(rawDesc)
  const areaName = exp.area?.name
  const industryNames = [
    exp.industry?.name,
    ...(Array.isArray(exp.industries) ? exp.industries.map((i) => i?.name) : []),
  ].filter((s): s is string => typeof s === "string" && s.length > 0)
  const uniqueIndustries = Array.from(new Set(industryNames))
  const employerLink = exp.employer?.alternate_url || exp.employer?.url || exp.company_url

  return (
    <div className="p-2.5 rounded-lg border border-border/60 bg-muted/40 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="w-3 h-3 shrink-0" />
        <span>
          {formatYearMonth(exp.start)} — {exp.end ? formatYearMonth(exp.end) : "по н.в."}
        </span>
      </div>
      {exp.company && (
        <p className="text-sm font-medium text-foreground break-words">
          {employerLink ? (
            <a
              href={employerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary inline-flex items-center gap-1"
            >
              {exp.company}
              <ExternalLink className="w-3 h-3 opacity-60" />
            </a>
          ) : (
            exp.company
          )}
        </p>
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
        <div
          className="text-xs text-muted-foreground break-words pt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-0.5 [&_p]:mb-1 [&_a]:text-primary [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: cleanDescription }}
        />
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

  // ── Личное ─────────────────────────────────────────────────────────────────
  const fullName = [resume?.last_name, resume?.first_name, resume?.middle_name]
    .filter(Boolean)
    .join(" ")
    .trim()
  const birthDate = pickStr(resume, "birth_date", "birthDate", "дата_рождения")
  const ageFromBirth = computeAge(birthDate)
  const age = resume?.age ?? ageFromBirth
  const gender = resume?.gender?.name
  const desiredPosition = pickStr(resume, "title", "position", "должность")
  const photoUrl = resume?.photo?.["100"] || resume?.photo?.medium || resume?.photo?.["240"] || resume?.photo?.small
  const citizenship = Array.isArray(resume?.citizenship)
    ? resume!.citizenship!.map((c) => c?.name).filter((s): s is string => !!s)
    : []
  const workTicket = Array.isArray(resume?.work_ticket)
    ? resume!.work_ticket!.map((w) => w?.name).filter((s): s is string => !!s)
    : []

  // ── Hidden fields — для пометок «скрыт кандидатом» ─────────────────────────
  const hiddenFieldsSet = new Set<string>(
    Array.isArray(resume?.hidden_fields)
      ? resume!.hidden_fields!.map((h) => h?.id).filter((s): s is string => !!s)
      : []
  )

  // ── Контакты ───────────────────────────────────────────────────────────────
  const phoneRes = getContact(resume?.contact, ["cell", "phone", "home", "work"], ["phones"], hiddenFieldsSet)
  const emailRes = getContact(resume?.contact, ["email"], ["email"], hiddenFieldsSet)
  const telegramRes = getContact(resume?.contact, ["telegram"], ["other_contacts"], hiddenFieldsSet)
  const whatsappRes = getContact(resume?.contact, ["whatsapp"], ["other_contacts"], hiddenFieldsSet)
  const maxRes = getContact(resume?.contact, ["max"], ["other_contacts"], hiddenFieldsSet)
  const skypeRes = getContact(resume?.contact, ["skype"], ["other_contacts"], hiddenFieldsSet)

  const phoneValue = phoneRes && "value" in phoneRes ? phoneRes.value : null
  const phoneHidden = phoneRes && "hidden" in phoneRes
  const emailValue = emailRes && "value" in emailRes ? emailRes.value : null
  const emailHidden = emailRes && "hidden" in emailRes
  const telegramValue = telegramRes && "value" in telegramRes ? telegramRes.value : null
  const whatsappValue = whatsappRes && "value" in whatsappRes ? whatsappRes.value : null
  const maxValue = maxRes && "value" in maxRes ? maxRes.value : null
  const skypeValue = skypeRes && "value" in skypeRes ? skypeRes.value : null

  // Fallback: phone/email из полей самого кандидата (когда hh не отдал contact[],
  // но мы получили их из other_contacts на уровне negotiations item).
  const phone = phoneValue ?? (phoneHidden ? null : fallback.phone)
  const email = emailValue ?? (emailHidden ? null : fallback.email)

  // ── Локация и переезд ──────────────────────────────────────────────────────
  const city = resume?.area?.name ?? fallback.city
  const metro = pickStr(resume?.metro, "name")
  const relocationType = resume?.relocation?.type?.name
  const relocationAreas = (() => {
    const list: string[] = []
    if (Array.isArray(resume?.relocation?.area)) {
      resume!.relocation!.area!.forEach((a) => {
        if (a?.name) list.push(a.name)
      })
    }
    if (Array.isArray(resume?.relocation?.city_list)) {
      resume!.relocation!.city_list!.forEach((a) => {
        if (a?.name) list.push(a.name)
      })
    }
    return Array.from(new Set(list))
  })()
  const businessTrip = resume?.business_trip_readiness?.name
  const travelTime = resume?.travel_time?.name

  // ── Опыт работы ────────────────────────────────────────────────────────────
  const totalExp = monthsToText(resume?.total_experience?.months) ?? fallback.experience
  const allExperiences = Array.isArray(resume?.experience) ? resume!.experience! : []

  // ── Образование ────────────────────────────────────────────────────────────
  const educationLevel = resume?.education?.level?.name
  const primaryEducation = Array.isArray(resume?.education?.primary) ? resume!.education!.primary : []
  const additionalEducation = Array.isArray(resume?.education?.additional) ? resume!.education!.additional : []
  const attestation = Array.isArray(resume?.education?.attestation) ? resume!.education!.attestation : []

  // ── Навыки и языки ─────────────────────────────────────────────────────────
  const languages = Array.isArray(resume?.language) ? resume!.language!.filter((l) => l?.name) : []
  const skillSet = Array.isArray(resume?.skill_set) ? resume!.skill_set!.filter(Boolean) : []
  const skillsText = pickStr(resume, "skills", "skills_text")

  // ── Условия ────────────────────────────────────────────────────────────────
  const schedules = Array.isArray(resume?.schedules)
    ? resume!.schedules!.map((s) => s?.name).filter((s): s is string => !!s)
    : []
  const employments = Array.isArray(resume?.employments)
    ? resume!.employments!.map((e) => e?.name).filter((s): s is string => !!s)
    : []
  const workFormat = Array.isArray(resume?.work_format)
    ? resume!.work_format!.map((w) => w?.name).filter((s): s is string => !!s)
    : []
  const employmentForm = Array.isArray(resume?.employment_form)
    ? resume!.employment_form!.map((e) => e?.name).filter((s): s is string => !!s)
    : []

  const salary = formatSalaryRange(
    resume?.salary?.amount ?? fallback.salaryMin,
    resume?.salary?.amount ?? fallback.salaryMax,
    resume?.salary?.currency,
  )

  // ── Транспорт ──────────────────────────────────────────────────────────────
  const driverLicenses = Array.isArray(resume?.driver_license_types)
    ? resume!.driver_license_types!
        .map((d) => d?.id)
        .filter((s): s is string => typeof s === "string" && s.length > 0)
    : []
  const hasVehicle = resume?.has_vehicle === true

  // ── Портфолио / рекомендации / сертификаты / сайты ─────────────────────────
  const recommendations = Array.isArray(resume?.recommendation) ? resume!.recommendation!.filter(Boolean) : []
  const portfolio = Array.isArray(resume?.portfolio) ? resume!.portfolio!.filter(Boolean) : []
  const certificates = Array.isArray(resume?.certificate) ? resume!.certificate!.filter(Boolean) : []
  const sites = Array.isArray(resume?.site)
    ? resume!.site!.filter((s) => s?.url && typeof s.url === "string")
    : []

  // ── Booleans для управления секциями ───────────────────────────────────────
  const hasPersonal = !!(fullName || age || gender || desiredPosition || salary || citizenship.length > 0 || workTicket.length > 0 || resume?.alternate_url)
  const hasContacts = !!(
    phone || email || telegramValue || whatsappValue || maxValue || skypeValue ||
    phoneHidden || emailHidden || city
  )
  const hasLocation = !!(city || metro || relocationType || relocationAreas.length > 0 || businessTrip || travelTime)
  const hasConditions = !!(salary || workFormat.length > 0 || employmentForm.length > 0 || schedules.length > 0 || employments.length > 0)

  return (
    <div className="space-y-5">
      {/* ── Личное ──────────────────────────────────────────────────────────── */}
      {hasPersonal && (
        <section className="space-y-1.5">
          <SectionHeader>Личное</SectionHeader>
          <div className="flex items-start gap-3">
            {photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={fullName || "Фото"}
                className="w-14 h-14 rounded-full object-cover shrink-0 border border-border/40"
              />
            )}
            <div className="flex-1 min-w-0 space-y-1">
              {fullName && (
                <p className="text-sm font-medium text-foreground break-words">{fullName}</p>
              )}
              {desiredPosition && (
                <p className="text-xs text-muted-foreground break-words">
                  Желаемая должность: <span className="text-foreground">{desiredPosition}</span>
                </p>
              )}
              {(age != null || gender || birthDate) && (
                <p className="text-xs text-muted-foreground">
                  {age != null ? `${age} ${ageWord(age)}` : ""}
                  {age != null && (gender || birthDate) ? " · " : ""}
                  {gender ?? ""}
                  {gender && birthDate ? " · " : !gender && birthDate ? "" : ""}
                  {birthDate ? formatYear(birthDate) : ""}
                </p>
              )}
            </div>
          </div>

          {salary && (
            <Row icon={DollarSign}>
              Желаемая зарплата: <span className="text-foreground font-medium">{salary}</span>
            </Row>
          )}
          {citizenship.length > 0 && (
            <Row icon={Globe2}>
              Гражданство:{" "}
              <span className="text-foreground">{citizenship.join(", ")}</span>
            </Row>
          )}
          {workTicket.length > 0 && (
            <Row icon={FileBadge}>
              Разрешение на работу:{" "}
              <span className="text-foreground">{workTicket.join(", ")}</span>
            </Row>
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
          {phone ? (
            <a
              href={`tel:${phone}`}
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors break-all"
            >
              <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {phone}
            </a>
          ) : phoneHidden ? (
            <HiddenContactRow icon={Phone} label="Телефон" />
          ) : null}

          {email ? (
            <a
              href={`mailto:${email}`}
              className="flex items-center gap-2 text-sm hover:text-primary transition-colors break-all"
            >
              <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {email}
            </a>
          ) : emailHidden ? (
            <HiddenContactRow icon={Mail} label="Email" />
          ) : null}

          {telegramValue && (
            <Row icon={Send}>
              <span className="text-foreground">Telegram: </span>
              <span className="break-all">{telegramValue}</span>
            </Row>
          )}
          {whatsappValue && (
            <Row icon={MessageSquare}>
              <span className="text-foreground">WhatsApp: </span>
              <span className="break-all">{whatsappValue}</span>
            </Row>
          )}
          {maxValue && (
            <Row icon={MessageSquare}>
              <span className="text-foreground">MAX: </span>
              <span className="break-all">{maxValue}</span>
            </Row>
          )}
          {skypeValue && (
            <Row icon={MessageSquare}>
              <span className="text-foreground">Skype: </span>
              <span className="break-all">{skypeValue}</span>
            </Row>
          )}

          {city && <Row icon={MapPin}>{city}</Row>}
        </section>
      )}

      {/* ── Локация и переезд ───────────────────────────────────────────────── */}
      {hasLocation && (
        <section className="space-y-1.5">
          <SectionHeader>Локация и переезд</SectionHeader>
          {city && <Row icon={MapPin}>Город: <span className="text-foreground">{city}</span></Row>}
          {metro && <Row icon={Train}>Метро: <span className="text-foreground">{metro}</span></Row>}
          {relocationType && (
            <Row icon={Plane}>
              Переезд: <span className="text-foreground">{relocationType}</span>
              {relocationAreas.length > 0 && (
                <span className="text-muted-foreground"> · {relocationAreas.join(", ")}</span>
              )}
            </Row>
          )}
          {businessTrip && (
            <Row icon={Plane}>
              Командировки: <span className="text-foreground">{businessTrip}</span>
            </Row>
          )}
          {travelTime && (
            <Row icon={Clock}>
              Время в пути: <span className="text-foreground">{travelTime}</span>
            </Row>
          )}
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
      {(educationLevel || primaryEducation.length > 0 || additionalEducation.length > 0 || attestation.length > 0) && (
        <section className="space-y-1.5">
          <SectionHeader>Образование</SectionHeader>
          {educationLevel && (
            <Row icon={GraduationCap}>
              <span className="text-foreground">{educationLevel}</span>
            </Row>
          )}
          {primaryEducation.map((ed, i) => (
            <div key={`p-${i}`} className="text-xs text-muted-foreground pl-5 break-words">
              <span className="text-foreground">
                {ed.name ?? ed.organization}
                {ed.university_acronym ? ` (${ed.university_acronym})` : ""}
              </span>
              {ed.organization && ed.name && ed.organization !== ed.name ? ` · ${ed.organization}` : ""}
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
          {attestation.length > 0 && (
            <div className="pl-5 pt-1 space-y-0.5">
              <p className="text-[10px] uppercase text-muted-foreground/70 tracking-wide">Аттестация</p>
              {attestation.map((at, i) => (
                <div key={`at-${i}`} className="text-xs text-muted-foreground break-words">
                  <span className="text-foreground">{at.name ?? at.organization}</span>
                  {at.result ? ` · ${at.result}` : ""}
                  {at.year ? ` (${at.year})` : ""}
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
                <Badge
                  key={`${s}-${i}`}
                  variant="secondary"
                  className="text-[10px] font-normal break-words"
                >
                  {s}
                </Badge>
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

      {/* ── Условия работы ──────────────────────────────────────────────────── */}
      {hasConditions && (
        <section className="space-y-1.5">
          <SectionHeader>Условия</SectionHeader>
          {salary && <Row icon={DollarSign}>{salary}</Row>}
          {employmentForm.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {employmentForm.map((e) => (
                <Badge key={`ef-${e}`} variant="secondary" className="text-[10px] font-normal">{e}</Badge>
              ))}
            </div>
          )}
          {workFormat.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {workFormat.map((w) => (
                <Badge key={`wf-${w}`} variant="secondary" className="text-[10px] font-normal">{w}</Badge>
              ))}
            </div>
          )}
          {employments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {employments.map((e) => (
                <Badge key={`em-${e}`} variant="outline" className="text-[10px] font-normal">{e}</Badge>
              ))}
            </div>
          )}
          {schedules.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {schedules.map((s) => (
                <Badge key={`sc-${s}`} variant="outline" className="text-[10px] font-normal">{s}</Badge>
              ))}
            </div>
          )}
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

      {/* ── Сертификаты ─────────────────────────────────────────────────── */}
      {certificates.length > 0 && (
        <section className="space-y-1.5">
          <SectionHeader>Сертификаты</SectionHeader>
          <div className="space-y-1">
            {certificates.map((c, i) => {
              const title = c.title || c.type || `Сертификат ${i + 1}`
              const subtitle = [c.owner, c.achieved_at]
                .filter((s): s is string => typeof s === "string" && s.length > 0)
                .join(" · ")
              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <FileBadge className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                  <div className="flex-1 min-w-0 break-words">
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {title}
                        <ExternalLink className="w-3 h-3 opacity-60" />
                      </a>
                    ) : (
                      <span className="text-foreground">{title}</span>
                    )}
                    {subtitle && (
                      <p className="text-[11px] text-muted-foreground">{subtitle}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Сайты и профили ────────────────────────────────────────────── */}
      {sites.length > 0 && (
        <section className="space-y-1.5">
          <SectionHeader>Сайты и профили</SectionHeader>
          <div className="space-y-1">
            {sites.map((s, i) => {
              const label = s.type?.name || s.type?.id || s.url || `Ссылка ${i + 1}`
              return (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Globe className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1 break-all"
                  >
                    <span className="text-foreground">{label}:</span>
                    <span>{s.url}</span>
                    <ExternalLink className="w-3 h-3 opacity-60 shrink-0" />
                  </a>
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
          <div className="grid grid-cols-3 gap-1.5">
            {portfolio.map((p, i) => {
              const path = p.medium?.path ?? p.large?.path ?? p.small?.path
              if (!path) return null
              return (
                <a
                  key={i}
                  href={p.large?.path ?? path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-lg overflow-hidden border border-border/60 hover:border-primary transition-colors"
                  title={p.description?.trim() || `Работа ${i + 1}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={path}
                    alt={p.description?.trim() || `Работа ${i + 1}`}
                    className="w-full h-20 object-cover group-hover:opacity-80 transition-opacity"
                  />
                </a>
              )
            })}
          </div>
          {portfolio.some((p) => p.description?.trim()) && (
            <div className="space-y-0.5 pt-1">
              {portfolio.map((p, i) =>
                p.description?.trim() ? (
                  <p key={`desc-${i}`} className="text-[11px] text-muted-foreground break-words">
                    <Link2 className="w-3 h-3 inline-block mr-1 -mt-0.5" />
                    {p.description.trim()}
                  </p>
                ) : null
              )}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

