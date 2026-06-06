import { NextResponse } from "next/server"
import tls from "node:tls"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { hhIntegrations, companies, cronRuns } from "@/lib/db/schema"
import { auth } from "@/auth"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

// Platform Admin → «Сроки»: что и когда истекает (TLS-серты, hh-токены), плюс
// здоровье кронов (последний запуск). Только платформенный админ (email whitelist).

interface CertInfo { name: string; host: string; validTo: string | null; daysLeft: number | null; error?: string }

function checkCert(host: string): Promise<{ validTo: string | null; error?: string }> {
  return new Promise((resolve) => {
    let done = false
    const finish = (r: { validTo: string | null; error?: string }) => { if (!done) { done = true; resolve(r) } }
    try {
      const socket = tls.connect({ host, port: 443, servername: host, timeout: 8000, rejectUnauthorized: false }, () => {
        const cert = socket.getPeerCertificate()
        socket.end()
        finish({ validTo: cert && cert.valid_to ? cert.valid_to : null })
      })
      socket.on("error", (e) => finish({ validTo: null, error: e.message }))
      socket.on("timeout", () => { socket.destroy(); finish({ validTo: null, error: "timeout" }) })
    } catch (e) {
      finish({ validTo: null, error: e instanceof Error ? e.message : "tls_error" })
    }
  })
}

function daysLeft(validTo: string | null): number | null {
  if (!validTo) return null
  const t = Date.parse(validTo)
  if (Number.isNaN(t)) return null
  return Math.round((t - Date.now()) / 86_400_000)
}

export async function GET() {
  const session = await auth()
  if (!isPlatformAdminEmail(session?.user?.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // 1) TLS-серты (живая проверка).
  const certHosts: { name: string; host: string }[] = [
    { name: "Основной домен company24.pro", host: "company24.pro" },
    // Произвольный поддомен → nginx отдаёт wildcard-серт *.company24.pro.
    { name: "Wildcard *.company24.pro (поддомены компаний)", host: "cert-check.company24.pro" },
    { name: "Стейджинг new.company24.pro", host: "new.company24.pro" },
  ]
  const certs: CertInfo[] = await Promise.all(certHosts.map(async (c) => {
    const r = await checkCert(c.host)
    return { name: c.name, host: c.host, validTo: r.validTo, daysLeft: daysLeft(r.validTo), error: r.error }
  }))

  // 2) hh-токены по компаниям.
  const hhRows = await db
    .select({
      company: companies.name,
      employerName: hhIntegrations.employerName,
      expiresAt: hhIntegrations.tokenExpiresAt,
      isActive: hhIntegrations.isActive,
      lastSyncedAt: hhIntegrations.lastSyncedAt,
    })
    .from(hhIntegrations)
    .innerJoin(companies, eq(companies.id, hhIntegrations.companyId))
  const hhTokens = hhRows.map((h) => ({
    company: h.company,
    employerName: h.employerName,
    expiresAt: h.expiresAt ? h.expiresAt.toISOString() : null,
    daysLeft: h.expiresAt ? Math.round((h.expiresAt.getTime() - Date.now()) / 86_400_000) : null,
    isActive: h.isActive,
    lastSyncedAt: h.lastSyncedAt ? h.lastSyncedAt.toISOString() : null,
  }))

  // 3) Кроны — последний запуск по каждому имени (из cron_runs).
  const allRuns = await db
    .select({ name: cronRuns.cronName, startedAt: cronRuns.startedAt, status: cronRuns.status, errorMessage: cronRuns.errorMessage })
    .from(cronRuns)
    .orderBy(desc(cronRuns.startedAt))
    .limit(500)
  const lastByCron = new Map<string, { name: string; lastRun: string; status: string; error: string | null }>()
  for (const r of allRuns) {
    if (!lastByCron.has(r.name)) {
      lastByCron.set(r.name, { name: r.name, lastRun: r.startedAt.toISOString(), status: r.status, error: r.errorMessage })
    }
  }
  const crons = [...lastByCron.values()]

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    certs,
    hhTokens,
    crons,
    backups: {
      note: "Авто-бэкап БД: ежедневно 03:00, gzip, ротация 30 дней (/root/backups). Офсайт пока не настроен.",
    },
  })
}
