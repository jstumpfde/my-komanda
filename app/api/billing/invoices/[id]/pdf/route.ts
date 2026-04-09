import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { invoices, plans, companies } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { apiError, requireCompany } from "@/lib/api-helpers"

function formatKopecks(kopecks: number): string {
  const rubles = Math.floor(kopecks / 100)
  const kop = kopecks % 100
  return `${rubles.toLocaleString("ru-RU")},${String(kop).padStart(2, "0")} ₽`
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("ru-RU")
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: Awaited<ReturnType<typeof requireCompany>>
  try {
    user = await requireCompany()
  } catch (e) {
    return e as NextResponse
  }

  const { id } = await params

  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.companyId, user.companyId)))
    .limit(1)

  const invoice = rows[0]
  if (!invoice) return apiError("Счёт не найден", 404)

  // Get plan name
  let planName = "—"
  if (invoice.planId) {
    const planRows = await db.select().from(plans).where(eq(plans.id, invoice.planId)).limit(1)
    if (planRows[0]) planName = planRows[0].name
  }

  // Get company info
  const companyRows = await db.select().from(companies).where(eq(companies.id, user.companyId)).limit(1)
  const company = companyRows[0]

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Счёт ${invoice.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #111; padding: 40px; }
    h1 { font-size: 20px; margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 24px; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; color: #666; margin-bottom: 6px; letter-spacing: 0.05em; }
    .row { display: flex; gap: 8px; margin-bottom: 4px; }
    .label { color: #666; min-width: 160px; }
    .value { font-weight: 500; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #f5f5f5; padding: 8px 10px; text-align: left; border: 1px solid #ddd; font-size: 12px; }
    td { padding: 8px 10px; border: 1px solid #ddd; }
    .amount-row td { font-weight: bold; background: #f9f9f9; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; }
    .status-issued { background: #fef9c3; color: #854d0e; }
    .status-paid { background: #dcfce7; color: #166534; }
    .status-draft { background: #f1f5f9; color: #475569; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; color: #888; font-size: 11px; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
    <div>
      <h1>Счёт на оплату</h1>
      <p class="subtitle">№ ${invoice.invoiceNumber}</p>
    </div>
    <div style="text-align:right;">
      <span class="status-badge status-${invoice.status ?? "draft"}">
        ${{ draft: "Черновик", issued: "Выставлен", paid: "Оплачен", cancelled: "Отменён" }[invoice.status ?? "draft"] ?? invoice.status}
      </span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Реквизиты продавца</div>
    <div class="row"><span class="label">Организация:</span><span class="value">ИП ШТУМПФ ЮРИЙ ГЕННАДЬЕВИЧ</span></div>
    <div class="row"><span class="label">ИНН:</span><span class="value">550615955642</span></div>
    <div class="row"><span class="label">Банк:</span><span class="value">АО «АЛЬФА-БАНК»</span></div>
    <div class="row"><span class="label">Р/с:</span><span class="value">40802810402720001811</span></div>
    <div class="row"><span class="label">БИК:</span><span class="value">044525593</span></div>
    <div class="row"><span class="label">К/с:</span><span class="value">30101810200000000593</span></div>
  </div>

  <div class="section">
    <div class="section-title">Покупатель</div>
    <div class="row"><span class="label">Организация:</span><span class="value">${company?.name ?? "—"}</span></div>
    ${company?.inn ? `<div class="row"><span class="label">ИНН:</span><span class="value">${company.inn}</span></div>` : ""}
    ${company?.billingEmail ? `<div class="row"><span class="label">Email:</span><span class="value">${company.billingEmail}</span></div>` : ""}
  </div>

  <div class="section">
    <div class="section-title">Детали счёта</div>
    <div class="row"><span class="label">Дата выставления:</span><span class="value">${formatDate(invoice.issuedAt)}</span></div>
    <div class="row"><span class="label">Срок оплаты:</span><span class="value">${formatDate(invoice.dueDate)}</span></div>
    ${invoice.paidAt ? `<div class="row"><span class="label">Дата оплаты:</span><span class="value">${formatDate(invoice.paidAt)}</span></div>` : ""}
  </div>

  <div class="section">
    <div class="section-title">Состав счёта</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Наименование</th>
          <th style="text-align:right;">Сумма</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>1</td>
          <td>Подписка на тариф «${planName}» (my-komanda)</td>
          <td style="text-align:right;">${formatKopecks(invoice.amountKopecks)}</td>
        </tr>
        <tr class="amount-row">
          <td colspan="2" style="text-align:right;">Итого к оплате:</td>
          <td style="text-align:right;">${formatKopecks(invoice.amountKopecks)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  ${invoice.notes ? `<div class="section"><div class="section-title">Примечания</div><p>${invoice.notes}</p></div>` : ""}

  <div class="footer">
    Счёт сформирован автоматически системой my-komanda.ru &nbsp;|&nbsp;
    Дата формирования: ${new Date().toLocaleDateString("ru-RU")}
  </div>

  <p class="no-print" style="margin-top:24px;">
    <button onclick="window.print()" style="padding:8px 20px;background:#4f46e5;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;">
      Распечатать / Сохранить PDF
    </button>
  </p>
</body>
</html>`

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoice-${invoice.invoiceNumber}.html"`,
    },
  })
}
