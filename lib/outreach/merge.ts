// Движок дедуп-слияния: UnifiedRow[] → таблицы outreach_*.
// Принцип: ключ = нормализованный ИНН (или dedupKey для строк без ИНН).
// При совпадении НЕ перезаписываем — заполняем только пустые поля + копим источники.
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  outreachCompanies, outreachContacts, outreachTrade,
  type OutreachSourceRef, type OutreachImportStats,
} from "@/lib/db/schema"
import type { UnifiedRow, SourceType } from "./types"
import { normInn, dedupKey } from "./normalize"

function tradeHasData(t?: UnifiedRow["trade"]): boolean {
  if (!t) return false
  return Boolean(
    (t.countries && t.countries.length) || t.tnvedCodes?.length ||
    t.suppliesCount != null || t.supplySumUsd != null || t.supplySumRub != null ||
    t.weightNet != null || t.revenueRub != null,
  )
}

export interface MergeOpts {
  companyId: string
  importId: string
  sourceType: SourceType
  file: string
  rows: UnifiedRow[]
}

// ВНИМАНИЕ: для очень больших файлов (десятки тысяч строк) вызывать чанками —
// здесь по одной строке за запрос ради корректности слияния. Оптимизация (bulk) — отдельно.
export async function mergeRows(opts: MergeOpts): Promise<OutreachImportStats> {
  const { companyId, importId, sourceType, file, rows } = opts
  const srcRef: OutreachSourceRef = {
    importId, file, sourceType, date: new Date().toISOString(),
  }
  let created = 0, merged = 0, skipped = 0, contactsAdded = 0

  for (const r of rows) {
    const innNorm = normInn(r.inn ?? "")
    const nm = (r.name ?? "").trim()
    if (!innNorm && !nm) { skipped++; continue }

    let targetId: string

    if (innNorm) {
      // Upsert по (company, inn_norm): coalesce оставляет существующее, иначе берёт новое.
      const res = await db
        .insert(outreachCompanies)
        .values({
          companyId, inn: r.inn, innNorm, name: r.name, fullName: r.fullName,
          region: r.region, address: r.address, website: r.website,
          okvedCode: r.okvedCode, okvedName: r.okvedName, ogrn: r.ogrn, kpp: r.kpp, segment: r.segment,
          dataJson: r.data, sourcesJson: [srcRef], dedupKey: null,
        })
        .onConflictDoUpdate({
          target: [outreachCompanies.companyId, outreachCompanies.innNorm],
          set: {
            name:      sql`coalesce(${outreachCompanies.name}, excluded.name)`,
            fullName:  sql`coalesce(${outreachCompanies.fullName}, excluded.full_name)`,
            region:    sql`coalesce(${outreachCompanies.region}, excluded.region)`,
            address:   sql`coalesce(${outreachCompanies.address}, excluded.address)`,
            website:   sql`coalesce(${outreachCompanies.website}, excluded.website)`,
            okvedCode: sql`coalesce(${outreachCompanies.okvedCode}, excluded.okved_code)`,
            okvedName: sql`coalesce(${outreachCompanies.okvedName}, excluded.okved_name)`,
            ogrn:      sql`coalesce(${outreachCompanies.ogrn}, excluded.ogrn)`,
            kpp:       sql`coalesce(${outreachCompanies.kpp}, excluded.kpp)`,
            segment:   sql`coalesce(${outreachCompanies.segment}, excluded.segment)`,
            dataJson:  sql`coalesce(excluded.data_json, '{}'::jsonb) || coalesce(${outreachCompanies.dataJson}, '{}'::jsonb)`,
            sourcesJson: sql`coalesce(${outreachCompanies.sourcesJson}, '[]'::jsonb) || excluded.sources_json`,
            deletedAt: sql`null`,   // повторная загрузка достаёт компанию из корзины — база = что загрузил
            updatedAt: sql`now()`,
          },
        })
        .returning({ id: outreachCompanies.id, inserted: sql<boolean>`(xmax = 0)` })
      targetId = res[0].id
      if (res[0].inserted) created++; else merged++
    } else {
      // Без ИНН — дедуп по нормализованному имени+регион.
      const dk = dedupKey(r.name, r.region)
      const found = await db
        .select({ id: outreachCompanies.id })
        .from(outreachCompanies)
        .where(and(eq(outreachCompanies.companyId, companyId), eq(outreachCompanies.dedupKey, dk)))
        .limit(1)
      if (found.length) {
        targetId = found[0].id
        await db.update(outreachCompanies).set({
          fullName: sql`coalesce(${outreachCompanies.fullName}, ${r.fullName ?? null})`,
          address:  sql`coalesce(${outreachCompanies.address}, ${r.address ?? null})`,
          website:  sql`coalesce(${outreachCompanies.website}, ${r.website ?? null})`,
          sourcesJson: sql`coalesce(${outreachCompanies.sourcesJson}, '[]'::jsonb) || ${JSON.stringify([srcRef])}::jsonb`,
          deletedAt: sql`null`,   // повторная загрузка достаёт компанию из корзины
          updatedAt: sql`now()`,
        }).where(eq(outreachCompanies.id, targetId))
        merged++
      } else {
        const ins = await db.insert(outreachCompanies).values({
          companyId, name: r.name, fullName: r.fullName, region: r.region,
          address: r.address, website: r.website, segment: r.segment, dataJson: r.data,
          sourcesJson: [srcRef], dedupKey: dk,
        }).returning({ id: outreachCompanies.id })
        targetId = ins[0].id
        created++
      }
    }

    // Контакты: дедуп по (target, kind, value).
    for (const c of r.contacts) {
      if (!c.value) continue
      const ins = await db.insert(outreachContacts).values({
        companyId, targetId, kind: c.kind, value: c.value, valueRaw: c.valueRaw,
        personName: c.personName, position: c.position, source: file,
      }).onConflictDoNothing({ target: [outreachContacts.targetId, outreachContacts.kind, outreachContacts.value] })
        .returning({ id: outreachContacts.id })
      if (ins.length) contactsAdded++
    }

    // ВЭД — отдельной строкой, если есть данные.
    if (tradeHasData(r.trade)) {
      const t = r.trade!
      await db.insert(outreachTrade).values({
        companyId, targetId, direction: t.direction, tnvedCodes: t.tnvedCodes,
        countries: t.countries, suppliesCount: t.suppliesCount, supplySumUsd: t.supplySumUsd,
        supplySumRub: t.supplySumRub, weightNet: t.weightNet, revenueRub: t.revenueRub,
        year: t.year, source: file,
      })
    }
  }

  return { total: rows.length, created, merged, skipped, contacts: contactsAdded }
}
