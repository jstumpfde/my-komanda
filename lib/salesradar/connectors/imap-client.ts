// Минимальный IMAP4rev1-клиент "с нуля" на net/tls — без внешних пакетов
// (imapflow/mailparser ставить нельзя, см. задачу). Покрывает ровно то, что
// нужно коннектору почты SalesRadar: LOGIN, SELECT, UID SEARCH, UID FETCH
// заголовков+текстовой части письма. НЕ претендует на полный RFC 3501:
// нет IDLE, нет обработки многотомных литералов сверх одного FETCH-ответа
// построчно, вложения не скачиваются (только имя/размер, если легко достать
// из Content-Disposition верхнего уровня).
//
// Если письмо устроено сложнее (глубокая вложенность multipart, нестандартный
// перенос строк) — best-effort: возвращаем то, что смогли распарсить, никогда
// не бросаем на кривом письме (один плохой UID не должен ронять весь pull).

import { connect as tlsConnect, type TLSSocket } from "node:tls"

export interface ImapCredentials {
  host: string
  port: number
  secure: boolean // TLS с порта (993) — STARTTLS не реализован в MVP
  user: string
  pass: string
}

export interface ImapMessageHeaders {
  from?: string
  to?: string
  subject?: string
  date?: string
  messageId?: string
  references?: string
  inReplyTo?: string
}

export interface ImapFetchedMessage {
  uid: number
  headers: ImapMessageHeaders
  textBody: string // best-effort извлечённый plain-text (декодирован из quoted-printable/base64)
}

const LINE_TIMEOUT_MS = 20_000

/** Низкоуровневое соединение: очередь строк с накоплением литералов {n}. */
class ImapConnection {
  private socket: TLSSocket
  private buf = Buffer.alloc(0)
  private closed = false

  constructor(socket: TLSSocket) {
    this.socket = socket
  }

  static async connect(creds: ImapCredentials): Promise<ImapConnection> {
    return new Promise((resolve, reject) => {
      const socket = tlsConnect({ host: creds.host, port: creds.port, servername: creds.host }, () => {
        const conn = new ImapConnection(socket)
        resolve(conn)
      })
      socket.on("error", reject)
      socket.setTimeout(LINE_TIMEOUT_MS, () => {
        socket.destroy(new Error("IMAP: таймаут соединения"))
      })
    })
  }

  private onData(chunk: Buffer) {
    this.buf = Buffer.concat([this.buf, chunk])
  }

  /** Читает одну строку (до CRLF), с учётом того, что данные могут прийти по частям. */
  private async readLine(): Promise<Buffer> {
    for (;;) {
      const idx = this.buf.indexOf("\r\n")
      if (idx >= 0) {
        const line = this.buf.subarray(0, idx)
        this.buf = this.buf.subarray(idx + 2)
        return line
      }
      await this.waitForData()
    }
  }

  private async readBytes(n: number): Promise<Buffer> {
    while (this.buf.length < n) {
      await this.waitForData()
    }
    const data = this.buf.subarray(0, n)
    this.buf = this.buf.subarray(n)
    return data
  }

  private waitForData(): Promise<void> {
    if (this.closed) return Promise.reject(new Error("IMAP: соединение закрыто"))
    return new Promise((resolve, reject) => {
      const onData = (chunk: Buffer) => {
        cleanup()
        this.onData(chunk)
        resolve()
      }
      const onError = (err: Error) => {
        cleanup()
        reject(err)
      }
      const onClose = () => {
        cleanup()
        this.closed = true
        reject(new Error("IMAP: соединение закрыто сервером"))
      }
      const cleanup = () => {
        this.socket.off("data", onData)
        this.socket.off("error", onError)
        this.socket.off("close", onClose)
      }
      this.socket.once("data", onData)
      this.socket.once("error", onError)
      this.socket.once("close", onClose)
    })
  }

  /**
   * Читает одну "логическую" строку ответа, разворачивая литералы {n} в
   * конце строки — возвращает исходную строку (с плейсхолдером убранным)
   * склеенную с телом литерала как одну строку текста, плюс любой хвост
   * после литерала на следующей физической строке присоединяется отдельно
   * вызывающим кодом при необходимости.
   */
  async readResponseLine(): Promise<string> {
    const line = await this.readLine()
    const text = line.toString("latin1")
    const literalMatch = text.match(/\{(\d+)\}\r?$/)
    if (!literalMatch) return text
    const n = parseInt(literalMatch[1], 10)
    const literal = await this.readBytes(n)
    // после литерала сервер обычно шлёт остаток строки (часто просто \r\n) —
    // считываем и приклеиваем, чтобы не потерять закрывающую скобку FETCH.
    const rest = await this.readLine()
    return text.replace(/\{\d+\}\r?$/, literal.toString("utf8")) + rest.toString("latin1")
  }

  write(data: string) {
    this.socket.write(data)
  }

  end() {
    try { this.socket.end() } catch { /* noop */ }
  }
}

let tagCounter = 0
function nextTag(): string {
  tagCounter += 1
  return `A${tagCounter.toString().padStart(4, "0")}`
}

/** Выполняет тегированную команду, собирает untagged-строки до тегированного OK/NO/BAD. */
async function runCommand(conn: ImapConnection, command: string): Promise<{ ok: boolean; lines: string[]; status: string }> {
  const tag = nextTag()
  conn.write(`${tag} ${command}\r\n`)
  const lines: string[] = []
  for (;;) {
    const line = await conn.readResponseLine()
    if (line.startsWith(`${tag} `)) {
      const status = line.slice(tag.length + 1)
      return { ok: /^OK/i.test(status), lines, status }
    }
    lines.push(line)
  }
}

export interface ImapMailboxInfo {
  uidValidity: number
  uidNext: number
  exists: number
}

export class ImapClient {
  private constructor(private conn: ImapConnection) {}

  static async connectAndLogin(creds: ImapCredentials): Promise<ImapClient> {
    const conn = await ImapConnection.connect(creds)
    // приветственный баннер сервера — одна untagged-строка
    await conn.readResponseLine()
    const escapedUser = creds.user.replace(/"/g, '\\"')
    const escapedPass = creds.pass.replace(/"/g, '\\"')
    const res = await runCommand(conn, `LOGIN "${escapedUser}" "${escapedPass}"`)
    if (!res.ok) {
      conn.end()
      throw new Error(`IMAP LOGIN не прошёл: ${res.status || "неизвестная ошибка"}`)
    }
    return new ImapClient(conn)
  }

  async select(folder: string): Promise<ImapMailboxInfo> {
    const res = await runCommand(this.conn, `SELECT "${folder}"`)
    if (!res.ok) throw new Error(`IMAP SELECT ${folder} не прошёл: ${res.status}`)
    let uidValidity = 0
    let uidNext = 0
    let exists = 0
    for (const line of res.lines) {
      const uv = line.match(/UIDVALIDITY (\d+)/i)
      if (uv) uidValidity = parseInt(uv[1], 10)
      const un = line.match(/UIDNEXT (\d+)/i)
      if (un) uidNext = parseInt(un[1], 10)
      const ex = line.match(/^\*\s+(\d+)\s+EXISTS/i)
      if (ex) exists = parseInt(ex[1], 10)
    }
    return { uidValidity, uidNext, exists }
  }

  /** UID SEARCH UID from:* — возвращает список UID больше lastUid (или все, если lastUid=0). */
  async searchUidsSince(lastUid: number): Promise<number[]> {
    const range = lastUid > 0 ? `${lastUid + 1}:*` : `1:*`
    const res = await runCommand(this.conn, `UID SEARCH UID ${range}`)
    if (!res.ok) throw new Error(`IMAP UID SEARCH не прошёл: ${res.status}`)
    const uids = new Set<number>()
    for (const line of res.lines) {
      const m = line.match(/^\*\s+SEARCH(.*)$/i)
      if (!m) continue
      for (const tok of m[1].trim().split(/\s+/)) {
        const n = parseInt(tok, 10)
        if (Number.isFinite(n) && n > 0) uids.add(n)
      }
    }
    return [...uids].sort((a, b) => a - b)
  }

  /** Тянет заголовки + текстовое тело по одному UID (best-effort парсинг). */
  async fetchMessage(uid: number): Promise<ImapFetchedMessage | null> {
    const res = await runCommand(this.conn, `UID FETCH ${uid} (BODY.PEEK[])`)
    if (!res.ok) return null
    const raw = res.lines.join("\n")
    // вырезаем RFC822-текст письма из FETCH-ответа: он между "BODY[] {n}" и
    // завершающей скобкой — readResponseLine уже подставил байты литерала на
    // место {n}, так что просто ищем начало по маркеру заголовка Return-Path/
    // From/Received и парсим как raw-письмо целиком.
    const bodyStart = raw.search(/(?:\r?\n|^)(?:Return-Path|Received|From|Delivered-To|Message-ID|Date):/i)
    const messageText = bodyStart >= 0 ? raw.slice(bodyStart) : raw
    return { uid, ...parseRawMessage(messageText) }
  }

  async logout() {
    try {
      await runCommand(this.conn, "LOGOUT")
    } catch { /* noop */ }
    this.conn.end()
  }
}

// ---- RFC822 парсинг (headers + best-effort text/plain body) ----

function decodeMimeWord(input: string): string {
  // =?charset?B|Q?encoded?=
  return input.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, _charset, enc, data) => {
    try {
      if (enc.toLowerCase() === "b") {
        return Buffer.from(data, "base64").toString("utf8")
      }
      // Q-encoding: _ -> space, =XX -> hex byte
      const q = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
      return Buffer.from(q, "latin1").toString("utf8")
    } catch {
      return data
    }
  })
}

function unfoldHeaders(raw: string): string[] {
  const lines = raw.split(/\r?\n/)
  const out: string[] = []
  for (const line of lines) {
    if (/^[ \t]/.test(line) && out.length > 0) {
      out[out.length - 1] += " " + line.trim()
    } else {
      out.push(line)
    }
  }
  return out
}

function parseRawMessage(raw: string): { headers: ImapMessageHeaders; textBody: string } {
  const headerEnd = raw.search(/\r?\n\r?\n/)
  const headerBlock = headerEnd >= 0 ? raw.slice(0, headerEnd) : raw
  const bodyBlockRaw = headerEnd >= 0 ? raw.slice(headerEnd).replace(/^\r?\n\r?\n/, "") : ""

  const map: Record<string, string> = {}
  for (const line of unfoldHeaders(headerBlock)) {
    const idx = line.indexOf(":")
    if (idx <= 0) continue
    const name = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    if (!(name in map)) map[name] = value // первое вхождение
  }

  const headers: ImapMessageHeaders = {
    from: map.from ? decodeMimeWord(map.from) : undefined,
    to: map.to ? decodeMimeWord(map.to) : undefined,
    subject: map.subject ? decodeMimeWord(map.subject) : undefined,
    date: map.date,
    messageId: map["message-id"],
    references: map.references,
    inReplyTo: map["in-reply-to"],
  }

  const contentType = (map["content-type"] || "text/plain").toLowerCase()
  const transferEncoding = (map["content-transfer-encoding"] || "").toLowerCase()
  let textBody = ""

  if (contentType.includes("multipart/")) {
    const boundaryMatch = map["content-type"]?.match(/boundary="?([^";]+)"?/i)
    if (boundaryMatch) {
      const boundary = boundaryMatch[1]
      const parts = bodyBlockRaw.split(`--${boundary}`)
      for (const part of parts) {
        const partHeaderEnd = part.search(/\r?\n\r?\n/)
        if (partHeaderEnd < 0) continue
        const partHeaders = part.slice(0, partHeaderEnd).toLowerCase()
        if (!partHeaders.includes("text/plain")) continue
        const partBody = part.slice(partHeaderEnd).replace(/^\r?\n\r?\n/, "")
        const partEnc = partHeaders.match(/content-transfer-encoding:\s*([\w-]+)/i)?.[1]?.toLowerCase() || ""
        textBody = decodeBody(partBody, partEnc)
        break
      }
    }
  } else if (contentType.includes("text/plain") || contentType === "") {
    textBody = decodeBody(bodyBlockRaw, transferEncoding)
  }
  // text/html-only письма в MVP не рендерим в текст — оставляем textBody пустым,
  // это лучше, чем протащить в AI сырой HTML.

  // ограничиваем размер, чтобы не тащить гигантские письма в БД/AI
  if (textBody.length > 20_000) textBody = textBody.slice(0, 20_000) + "\n[...обрезано]"

  return { headers, textBody: textBody.trim() }
}

function decodeBody(body: string, encoding: string): string {
  if (encoding === "base64") {
    try {
      return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8")
    } catch {
      return body
    }
  }
  if (encoding === "quoted-printable") {
    return body
      .replace(/=\r?\n/g, "") // soft line breaks
      .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
  }
  return body
}
