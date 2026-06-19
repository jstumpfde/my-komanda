// Распознавание источника по заголовкам + маппинг сырой строки в UnifiedRow.
import type { RawRow, SourceType, UnifiedRow, UnifiedContact } from "./types"
import {
  normInn, extractInn, normPhone, normEmail, normSite, normHandle,
  parseNum, splitMulti, cleanStr,
} from "./normalize"

const low = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim()

/** Найти значение колонки по подстроке заголовка (первое непустое совпадение). */
function col(row: RawRow, ...needles: string[]): string {
  const keys = Object.keys(row)
  for (const nd of needles) {
    const n = low(nd)
    for (const k of keys) {
      if (low(k).includes(n)) {
        const v = cleanStr(row[k])
        if (v) return v
      }
    }
  }
  return ""
}

/** Все значения колонок, чьи заголовки содержат подстроку (для нескольких «Телефон»). */
function cols(row: RawRow, needle: string): string[] {
  const n = low(needle)
  const out: string[] = []
  for (const k of Object.keys(row)) {
    if (low(k).includes(n)) {
      const v = cleanStr(row[k])
      if (v) out.push(v)
    }
  }
  return out
}

/** Определить тип источника по набору заголовков. */
export function detectSource(headers: string[]): SourceType {
  const h = headers.map(low)
  const has = (s: string) => h.some((x) => x.includes(low(s)))
  if (has("сумма поставок") || has("вес нетто") || (has("количество поставок") && has("страны"))) return "globusved"
  if (has("главный оквэд") || (has("окопф") && has("огрн"))) return "egrul"
  if (has("сценарий") && has("организация") && (has("направление вызова") || has("сотрудник"))) return "calls"
  if (has("контактные лица") && has("регион")) return "regional"
  if (has("роль в системе") || has("аббревиатура компани") || has("наименование компани")) return "portal"
  return "unknown"
}

function pushPhones(out: UnifiedContact[], raw: string, person?: string, position?: string) {
  for (const part of splitMulti(raw)) {
    const v = normPhone(part)
    if (v) out.push({ kind: "phone", value: v, valueRaw: part, personName: person || undefined, position: position || undefined })
  }
}
function pushEmails(out: UnifiedContact[], raw: string, person?: string) {
  for (const part of splitMulti(raw)) {
    const v = normEmail(part)
    if (v) out.push({ kind: "email", value: v, valueRaw: part, personName: person || undefined })
  }
}

/** Маппинг одной строки → UnifiedRow по типу источника. */
export function mapRow(src: SourceType, row: RawRow): UnifiedRow {
  const contacts: UnifiedContact[] = []
  const innRaw = col(row, "инн")
  const name = col(row, "название компании", "наименование компани", "компания", "организация")
  let inn = normInn(innRaw) || extractInn(innRaw) || extractInn(name)

  const r: UnifiedRow = {
    inn: inn || undefined,
    name: name || undefined,
    region: col(row, "регион") || undefined,
    address: col(row, "адрес") || undefined,
    contacts,
  }

  if (src === "globusved") {
    r.trade = {
      direction: "import",
      countries: splitMulti(col(row, "страны")),
      suppliesCount: parseNum(col(row, "количество поставок")),
      supplySumUsd: parseNum(col(row, "сумма поставок, $", "сумма поставок, $")),
      supplySumRub: parseNum(col(row, "сумма поставок, руб")),
      weightNet: parseNum(col(row, "вес нетто")),
      revenueRub: parseNum(col(row, "выручка")),
      year: parseNum(col(row, "год выручки")),
    }
  } else if (src === "regional") {
    const persons = col(row, "контактные лица")
    pushEmails(contacts, col(row, "электронная почта", "почта", "e-mail", "email"), persons)
    cols(row, "телефон").forEach((p) => pushPhones(contacts, p, persons))
    for (const p of splitMulti(persons)) contacts.push({ kind: "person", value: p, personName: p })
  } else if (src === "egrul") {
    r.fullName = col(row, "полное наименование") || undefined
    r.okvedCode = col(row, "оквэд (код)", "главный оквэд (код)") || undefined
    r.okvedName = col(row, "оквэд (назв", "главный оквэд (назв") || undefined
    r.ogrn = col(row, "огрн") || undefined
    r.kpp = col(row, "кпп") || undefined
    pushPhones(contacts, col(row, "стационарный телефон"))
    pushPhones(contacts, col(row, "мобильный телефон"))
    const wa = normPhone(col(row, "whatsapp"))
    if (wa) contacts.push({ kind: "whatsapp", value: wa })
    const tg = normHandle(col(row, "telegram"))
    if (tg) contacts.push({ kind: "telegram", value: tg })
  } else if (src === "calls") {
    const person = col(row, "контакт")
    const position = col(row, "должность")
    r.region = col(row, "регион", "должность") || r.region   // в звонках регион иногда в «Должность»
    const site = normSite(col(row, "сайт"))
    if (site) { r.website = site; contacts.push({ kind: "site", value: site }) }
    r.segment = col(row, "сфера деятельности") || undefined
    cols(row, "телефон").forEach((p) => pushPhones(contacts, p, person, position))
    if (person) contacts.push({ kind: "person", value: person, personName: person, position: position || undefined })
  } else if (src === "portal") {
    r.fullName = col(row, "наименование компани", "полное наимен") || undefined
    const site = normSite(col(row, "сайт компании", "сайт"))
    if (site) r.website = site
    pushEmails(contacts, col(row, "почта e-mail", "e-mail", "email"))
    const user = col(row, "пользователи компани")
    if (user) contacts.push({ kind: "person", value: user, personName: user })
    r.segment = col(row, "роль в системе") || undefined
  } else {
    // unknown: соберём что сможем — телефоны/почты по любым заголовкам
    cols(row, "телефон").forEach((p) => pushPhones(contacts, p))
    pushEmails(contacts, col(row, "email", "почта", "e-mail"))
    const site = normSite(col(row, "сайт", "website"))
    if (site) r.website = site
  }

  // прочие непустые колонки складываем в data (мешок), чтобы не потерять
  const known = new Set(contacts.map(() => ""))
  const data: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    const val = cleanStr(v)
    if (val && !known.has(k)) data[k] = val
  }
  if (Object.keys(data).length) r.data = data

  if (r.website && !contacts.some((c) => c.kind === "site")) contacts.push({ kind: "site", value: r.website })
  return r
}
