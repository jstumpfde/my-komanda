import { NextRequest, NextResponse } from "next/server"
import { readFileSync } from "fs"
import { join } from "path"
import { db } from "@/lib/db"
import { invoices, plans, companies } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"
import { apiError, requireCompany } from "@/lib/api-helpers"
import { amountToWordsRu } from "@/lib/number-to-words-ru"

const signatureBase64 = readFileSync(join(process.cwd(), "public/signature.png")).toString("base64")

function formatKopecks(kopecks: number): string {
  const rubles = Math.floor(kopecks / 100)
  const kop = kopecks % 100
  return `${rubles.toLocaleString("ru-RU")}.${String(kop).padStart(2, "0")}`
}

function formatDateRu(d: Date | string | null | undefined): string {
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

  let planName = "—"
  if (invoice.planId) {
    const planRows = await db.select().from(plans).where(eq(plans.id, invoice.planId)).limit(1)
    if (planRows[0]) planName = planRows[0].name
  }

  const companyRows = await db.select().from(companies).where(eq(companies.id, user.companyId)).limit(1)
  const company = companyRows[0]

  const amount = invoice.amountKopecks ?? invoice.amount ?? 0
  const amountRub = formatKopecks(amount)
  const amountWords = amountToWordsRu(amount)
  const invoiceDate = formatDateRu(invoice.issuedAt ?? invoice.createdAt)
  const buyerName = company?.name ?? "—"
  const buyerInn = company?.inn ?? ""
  const buyerKpp = company?.kpp ?? ""
  const buyerLine = `${buyerName}${buyerInn ? `, ИНН ${buyerInn}` : ""}${buyerKpp ? `, КПП ${buyerKpp}` : ""}`

  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Счёт ${invoice.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Times New Roman", Times, serif; font-size: 12px; color: #000; padding: 30px 40px; line-height: 1.4; }
    .header { text-align: center; margin-bottom: 16px; font-size: 11px; }
    .header .name { font-weight: bold; font-size: 13px; }
    .pp-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .pp-table td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; vertical-align: top; }
    .pp-table .label { color: #555; font-size: 10px; }
    .pp-table .no-border-bottom { border-bottom: none; }
    .pp-table .no-border-top { border-top: none; }
    .title { text-align: center; font-size: 16px; font-weight: bold; margin: 20px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #000; }
    .info-row { margin-bottom: 4px; font-size: 12px; }
    .info-row .label { color: #555; }
    .info-row .value { font-weight: normal; }
    .items-table { width: 100%; border-collapse: collapse; margin: 16px 0 8px; }
    .items-table th, .items-table td { border: 1px solid #000; padding: 5px 8px; font-size: 12px; }
    .items-table th { background: #f0f0f0; font-weight: bold; text-align: center; }
    .items-table td.num { text-align: center; }
    .items-table td.money { text-align: right; white-space: nowrap; }
    .totals { margin: 8px 0 16px; text-align: right; font-size: 12px; }
    .totals .line { margin-bottom: 3px; }
    .totals .bold { font-weight: bold; }
    .words { margin: 12px 0; font-size: 12px; }
    .words .bold { font-weight: bold; }
    .sign-block { margin-top: 40px; font-size: 12px; }
    .sign-block .sign-role { font-weight: bold; margin-bottom: 12px; }
    .sign-cols { display: flex; align-items: flex-end; gap: 0; margin-top: 8px; }
    .sign-col { text-align: center; }
    .sign-col .sign-val { min-height: 60px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 4px; }
    .sign-col .sign-label { border-top: 1px solid #000; padding-top: 2px; font-size: 9px; color: #555; margin-top: 2px; }
    .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ccc; color: #888; font-size: 10px; text-align: center; }
    @media print {
      .no-print { display: none !important; }
      body { padding: 10px 20px; }
    }
  </style>
</head>
<body>

  <div class="no-print" style="margin-bottom:20px;">
    <button onclick="window.print()" style="padding:8px 20px;background:#4f46e5;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-family:Arial,sans-serif;">
      Распечатать / Сохранить PDF
    </button>
  </div>

  <!-- Шапка -->
  <div class="header">
    <div class="name">Индивидуальный предприниматель Штумпф Юрий Геннадьевич</div>
    <div>123290, г. Москва, ул. Шелепихинская наб. д. 34 / 704</div>
    <div>тел: +7 (926) 483-77-88 &nbsp;&nbsp; email: stumpfik@mail.ru</div>
  </div>

  <!-- Образец заполнения платёжного поручения -->
  <table class="pp-table">
    <tr>
      <td colspan="2" class="no-border-bottom" style="font-size:10px;color:#555;">Образец заполнения платёжного поручения</td>
      <td class="no-border-bottom"></td>
      <td class="no-border-bottom"></td>
    </tr>
    <tr>
      <td rowspan="2" style="width:60%;">
        <span class="label">Банк получателя</span><br/>
        АО "АЛЬФА-БАНК" г. МОСКВА
      </td>
      <td style="width:10%;"><span class="label">БИК</span></td>
      <td colspan="2">044525593</td>
    </tr>
    <tr>
      <td><span class="label">Сч.№</span></td>
      <td colspan="2">30101810200000000593</td>
    </tr>
    <tr>
      <td rowspan="2">
        <span class="label">ИНН</span> 550615955642 &nbsp;&nbsp; <span class="label">КПП</span> —<br/>
        <span class="label">Получатель</span><br/>
        Индивидуальный предприниматель Штумпф Юрий Геннадьевич
      </td>
      <td><span class="label">Сч.№</span></td>
      <td colspan="2">40802810402720001811</td>
    </tr>
    <tr>
      <td colspan="3"></td>
    </tr>
  </table>

  <!-- Заголовок счёта -->
  <div class="title">Счёт на оплату № ${invoice.invoiceNumber} от ${invoiceDate}г.</div>

  <!-- Поставщик / Покупатель -->
  <div class="info-row">
    <span class="label">Поставщик:</span>
    <span class="value">Индивидуальный предприниматель Штумпф Юрий Геннадьевич, ИНН 550615955642</span>
  </div>
  <div class="info-row" style="margin-bottom:12px;">
    <span class="label">Покупатель:</span>
    <span class="value">${buyerLine}</span>
  </div>

  <!-- Таблица товаров -->
  <table class="items-table">
    <thead>
      <tr>
        <th style="width:30px;">№</th>
        <th>Товары (работы, услуги)</th>
        <th style="width:50px;">Кол-во</th>
        <th style="width:40px;">Ед.</th>
        <th style="width:100px;">Цена</th>
        <th style="width:100px;">Сумма</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="num">1</td>
        <td>Подписка на тариф «${planName}» (Company24.pro)</td>
        <td class="num">1</td>
        <td class="num">ед.</td>
        <td class="money">${amountRub}</td>
        <td class="money">${amountRub}</td>
      </tr>
    </tbody>
  </table>

  <!-- Итого -->
  <div class="totals">
    <div class="line"><span class="bold">Итого:</span> ${amountRub} руб.</div>
    <div class="line">Без НДС</div>
    <div class="line"><span class="bold">Всего к оплате:</span> ${amountRub} руб.</div>
  </div>

  <!-- Сумма прописью -->
  <div class="words">
    Всего к оплате: <span class="bold">${amountWords}</span>
  </div>

  <!-- Подпись -->
  <div class="sign-block">
    <div class="sign-role">Поставщик</div>
    <div class="sign-cols">
      <div class="sign-col" style="flex:1;">
        <div class="sign-val">Индивидуальный предприниматель</div>
        <div class="sign-label">должность</div>
      </div>
      <div class="sign-col" style="flex:1;">
        <div class="sign-val"><img src="data:image/png;base64,${signatureBase64}" style="height:60px;" /></div>
        <div class="sign-label">подпись</div>
      </div>
      <div class="sign-col" style="flex:1;">
        <div class="sign-val">Штумпф Юрий Геннадьевич</div>
        <div class="sign-label">расшифровка подписи</div>
      </div>
    </div>
  </div>

  <!-- Футер -->
  <div class="footer">
    Счёт сформирован автоматически системой Company24.pro
  </div>

</body>
</html>`

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  })
}
