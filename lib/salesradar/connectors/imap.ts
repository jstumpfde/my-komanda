// Коннектор почты (kind='imap'). MVP на собственном IMAP-клиенте
// (imap-client.ts, net/tls, без внешних пакетов — imapflow/mailparser ставить
// нельзя). Читает последние сообщения INBOX по UID-курсору, без вложений.
//
// config (открытый jsonb): { host, port, secure, folder?, ourDomains?: string[] }
// creds (шифруются в credentialsEnc через lib/salesradar/crypto.ts): { user, pass }
// cursorJson: { folder, uidValidity, lastUid }
//
// threadKey — по References[0] || In-Reply-To || Message-ID; если ничего нет,
// нормализованная тема (без "Re:"/"Fwd:") — грубый fallback для MVP.

import type {
  ChannelConnector,
  ConnectorPullContext,
  ConnectorPullResult,
  ConnectorValidationResult,
  NormalizedMessage,
  RawMessage,
} from "../types"
import { ImapClient, type ImapFetchedMessage } from "./imap-client"

export interface ImapConfig {
  host: string
  port?: number
  secure?: boolean
  folder?: string
  ourDomains?: string[] // домены компании — письма From этих доменов считаем isOurs=true (исходящие)
}

export interface ImapCreds {
  user: string
  pass: string
}

interface ImapCursor {
  folder: string
  uidValidity: number
  lastUid: number
}

const DEFAULT_FOLDER = "INBOX"
const DEFAULT_PORT = 993
const MAX_MESSAGES_PER_PULL = 50

function asImapConfig(config: unknown): ImapConfig {
  const c = (config || {}) as Partial<ImapConfig>
  if (!c.host) throw new Error("IMAP: не указан host")
  return { host: c.host, port: c.port ?? DEFAULT_PORT, secure: c.secure ?? true, folder: c.folder ?? DEFAULT_FOLDER, ourDomains: c.ourDomains ?? [] }
}

function asImapCreds(creds: unknown): ImapCreds {
  const c = (creds || {}) as Partial<ImapCreds>
  if (!c.user || !c.pass) throw new Error("IMAP: не указаны user/pass")
  return { user: c.user, pass: c.pass }
}

function extractEmail(headerValue?: string): string | undefined {
  if (!headerValue) return undefined
  const m = headerValue.match(/<([^>]+)>/) || headerValue.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/)
  return m ? m[1].toLowerCase() : undefined
}

function normalizeSubjectForThreading(subject?: string): string {
  return (subject || "").replace(/^(re|fwd?|fw)\s*:\s*/gi, "").trim().toLowerCase() || "no-subject"
}

function messageThreadKey(headers: ImapFetchedMessage["headers"]): string {
  const refs = (headers.references || "").trim().split(/\s+/).filter(Boolean)
  if (refs.length > 0) return refs[0]
  if (headers.inReplyTo) return headers.inReplyTo.trim()
  if (headers.messageId) return headers.messageId.trim()
  return `subject:${normalizeSubjectForThreading(headers.subject)}`
}

export const imapConnector: ChannelConnector = {
  kind: "imap",
  capabilities: { pull: true, webhook: false, send: false },

  async validate(config, creds): Promise<ConnectorValidationResult> {
    try {
      const cfg = asImapConfig(config)
      const cr = asImapCreds(creds)
      const client = await ImapClient.connectAndLogin({ host: cfg.host, port: cfg.port!, secure: cfg.secure!, user: cr.user, pass: cr.pass })
      const info = await client.select(cfg.folder || DEFAULT_FOLDER)
      await client.logout()
      return { ok: true, accountLabel: `${cr.user} (${cfg.folder || DEFAULT_FOLDER}, ${info.exists} писем)` }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  },

  async pull(ctx: ConnectorPullContext & { config?: unknown; creds?: unknown }): Promise<ConnectorPullResult> {
    // config/creds передаются вызывающим кодом (registry/pull-роут достаёт их
    // из БД и расшифровывает); интерфейс типа в types.ts их не содержит
    // напрямую в ConnectorPullContext, поэтому читаем через (ctx as any) —
    // см. вызов в app/api/cron/salesradar-pull/route.ts.
    const cfg = asImapConfig((ctx as unknown as { config?: unknown }).config)
    const cr = asImapCreds((ctx as unknown as { creds?: unknown }).creds)
    const cursor = (ctx.cursor || {}) as Partial<ImapCursor>
    const folder = cfg.folder || DEFAULT_FOLDER
    const t0 = Date.now()

    const client = await ImapClient.connectAndLogin({ host: cfg.host, port: cfg.port!, secure: cfg.secure!, user: cr.user, pass: cr.pass })
    try {
      const info = await client.select(folder)
      const uidValidityChanged = cursor.uidValidity != null && cursor.uidValidity !== info.uidValidity
      const lastUid = uidValidityChanged ? 0 : (cursor.lastUid ?? 0)

      const uids = await client.searchUidsSince(lastUid)
      const toFetch = uids.slice(0, MAX_MESSAGES_PER_PULL)

      const messages: RawMessage[] = []
      let newLastUid = lastUid
      for (const uid of toFetch) {
        if (Date.now() - t0 > ctx.budgetMs) break
        const msg = await client.fetchMessage(uid)
        if (msg) {
          messages.push({ __connector: "imap", ourDomains: cfg.ourDomains ?? [], ...msg })
          newLastUid = Math.max(newLastUid, uid)
        } else {
          newLastUid = Math.max(newLastUid, uid) // не зависаем на битом письме — курсор всё равно двигаем
        }
      }

      const nextCursor: ImapCursor = { folder, uidValidity: info.uidValidity, lastUid: newLastUid }
      return { messages, cursor: nextCursor }
    } finally {
      await client.logout()
    }
  },

  normalize(raw: RawMessage): NormalizedMessage {
    const m = raw as ImapFetchedMessage & { __connector: "imap"; ourDomains: string[] }
    const fromEmail = extractEmail(m.headers.from)
    const isOurs = !!fromEmail && m.ourDomains.some((d) => fromEmail.endsWith(`@${d.toLowerCase()}`))
    let sentAt = new Date()
    if (m.headers.date) {
      const parsed = new Date(m.headers.date)
      if (!Number.isNaN(parsed.getTime())) sentAt = parsed
    }
    return {
      externalId: m.headers.messageId?.trim() || `uid:${m.uid}`,
      threadKey: messageThreadKey(m.headers),
      direction: isOurs ? "out" : "in",
      author: { externalId: fromEmail, name: m.headers.from, isOurs },
      text: m.textBody || null,
      attachments: [], // Ф1: без вложений (см. план)
      sentAt,
      identityHints: { email: fromEmail },
    }
  },
}
