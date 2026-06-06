import { db } from "@/lib/db"
import { invoices, companies, plans } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { sendMail } from "@/lib/mail"
import { renderInvoiceHtml } from "./invoice-pdf-html"
import { renderActHtml } from "./act-pdf-html"

export type BillingDocKind = "invoice" | "act"

export interface SendResult { sent: boolean; to?: string; reason?: string }

// Отправляет счёт или закрывающий акт на email компании (companies.billingEmail).
// Документ — HTML-вложение (открыть и сохранить/распечатать в PDF), как и в UI.
// На стейджинге/деве реально не уходит (INTEGRATIONS_DISABLED в lib/mail).
export async function sendInvoiceDocument(invoiceId: string, kind: BillingDocKind): Promise<SendResult> {
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1)
  if (!invoice) return { sent: false, reason: "счёт не найден" }

  const [company] = await db.select().from(companies).where(eq(companies.id, invoice.companyId)).limit(1)
  if (!company) return { sent: false, reason: "компания не найдена" }

  const to = company.billingEmail?.trim()
  if (!to) return { sent: false, reason: "не указан email для счетов/актов" }

  let planName = "—"
  if (invoice.planId) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, invoice.planId)).limit(1)
    if (plan) planName = plan.name
  }

  const buyer = { name: company.name, inn: company.inn, kpp: company.kpp }
  const amountRub = Math.round((invoice.amountKopecks ?? invoice.amount ?? 0) / 100).toLocaleString("ru-RU")

  const html = kind === "act"
    ? renderActHtml(invoice, buyer, planName)
    : renderInvoiceHtml(invoice, buyer, planName)

  const docWord = kind === "act" ? "Акт" : "Счёт"
  const filename = `${docWord} ${invoice.invoiceNumber}.html`
  const subject = `${docWord} № ${invoice.invoiceNumber} — Company24.pro`
  const body = kind === "act"
    ? `Здравствуйте!\n\nВо вложении — закрывающий акт № ${invoice.invoiceNumber} на сумму ${amountRub} ₽.\nОткройте файл и при необходимости сохраните или распечатайте в PDF.\n\nС уважением, Company24.pro`
    : `Здравствуйте!\n\nВо вложении — счёт на оплату № ${invoice.invoiceNumber} на сумму ${amountRub} ₽${invoice.dueDate ? ` (оплатить до ${new Date(invoice.dueDate).toLocaleDateString("ru-RU")})` : ""}.\nОткройте файл и при необходимости сохраните или распечатайте в PDF.\n\nС уважением, Company24.pro`

  await sendMail({
    to, subject, text: body,
    attachments: [{ filename, content: html, contentType: "text/html; charset=utf-8" }],
  })

  return { sent: true, to }
}
