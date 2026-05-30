import { readFileSync } from "fs"
import { join } from "path"
import { amountToWordsRu } from "@/lib/number-to-words-ru"
import type { InvoicePdfInput, InvoiceBuyerInput } from "./invoice-pdf-html"

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

// Акт сдачи-приёмки оказанных услуг по образцу счёта (lib/billing/invoice-pdf-html.ts).
// Номер акта = номер счёта; дата = дата оплаты (или выставления/создания).
export function renderActHtml(
  invoice: InvoicePdfInput & { paidAt?: Date | string | null; periodStart?: Date | string | null; periodEnd?: Date | string | null },
  buyer: InvoiceBuyerInput,
  planName: string,
): string {
  const amount = invoice.amountKopecks ?? invoice.amount ?? 0
  const amountRub = formatKopecks(amount)
  const amountWords = amountToWordsRu(amount)
  const actDate = formatDateRu(invoice.paidAt ?? invoice.issuedAt ?? invoice.createdAt)
  const buyerName = buyer.name ?? "—"
  const buyerInn = buyer.inn ?? ""
  const buyerKpp = buyer.kpp ?? ""
  const buyerLine = `${buyerName}${buyerInn ? `, ИНН ${buyerInn}` : ""}${buyerKpp ? `, КПП ${buyerKpp}` : ""}`
  const period = invoice.periodStart || invoice.periodEnd
    ? ` за период ${formatDateRu(invoice.periodStart)} — ${formatDateRu(invoice.periodEnd)}`
    : ""

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Акт ${invoice.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Times New Roman", Times, serif; font-size: 12px; color: #000; padding: 30px 40px; line-height: 1.4; }
    .header { text-align: center; margin-bottom: 16px; font-size: 11px; }
    .header .name { font-weight: bold; font-size: 13px; }
    .title { text-align: center; font-size: 16px; font-weight: bold; margin: 20px 0 16px; padding-bottom: 8px; border-bottom: 2px solid #000; }
    .info-row { margin-bottom: 4px; font-size: 12px; }
    .info-row .label { color: #555; }
    .items-table { width: 100%; border-collapse: collapse; margin: 16px 0 8px; }
    .items-table th, .items-table td { border: 1px solid #000; padding: 5px 8px; font-size: 12px; }
    .items-table th { background: #f0f0f0; font-weight: bold; text-align: center; }
    .items-table td.num { text-align: center; }
    .items-table td.money { text-align: right; white-space: nowrap; }
    .totals { margin: 8px 0 16px; text-align: right; font-size: 12px; }
    .totals .bold { font-weight: bold; }
    .words { margin: 12px 0; font-size: 12px; }
    .words .bold { font-weight: bold; }
    .clause { margin: 14px 0; font-size: 12px; }
    .sign-block { margin-top: 36px; font-size: 12px; display: flex; justify-content: space-between; gap: 40px; }
    .sign-col { flex: 1; }
    .sign-col .role { font-weight: bold; margin-bottom: 18px; }
    .sign-col .line { border-top: 1px solid #000; padding-top: 2px; font-size: 9px; color: #555; margin-top: 28px; }
    .sign-col .sig { position: relative; }
    .sign-col .sig img { position: absolute; bottom: -6px; left: 0; height: 56px; }
    .footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #ccc; color: #888; font-size: 10px; text-align: center; }
    @media print { .no-print { display: none !important; } body { padding: 10px 20px; } }
  </style>
</head>
<body>

  <div class="no-print" style="margin-bottom:20px;">
    <button onclick="window.print()" style="padding:8px 20px;background:#4f46e5;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-family:Arial,sans-serif;">
      Распечатать / Сохранить PDF
    </button>
  </div>

  <div class="header">
    <div class="name">Индивидуальный предприниматель Штумпф Юрий Геннадьевич</div>
    <div>123290, г. Москва, ул. Шелепихинская наб. д. 34 / 704</div>
    <div>ИНН 550615955642 &nbsp;&nbsp; тел: +7 (926) 483-77-88 &nbsp;&nbsp; email: stumpfik@mail.ru</div>
  </div>

  <div class="title">Акт № ${invoice.invoiceNumber} от ${actDate}г.<br/><span style="font-size:12px;font-weight:normal;">сдачи-приёмки оказанных услуг</span></div>

  <div class="info-row">
    <span class="label">Исполнитель:</span>
    <span>Индивидуальный предприниматель Штумпф Юрий Геннадьевич, ИНН 550615955642</span>
  </div>
  <div class="info-row" style="margin-bottom:12px;">
    <span class="label">Заказчик:</span>
    <span>${buyerLine}</span>
  </div>

  <table class="items-table">
    <thead>
      <tr>
        <th style="width:30px;">№</th>
        <th>Наименование работ (услуг)</th>
        <th style="width:50px;">Кол-во</th>
        <th style="width:40px;">Ед.</th>
        <th style="width:100px;">Цена</th>
        <th style="width:100px;">Сумма</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="num">1</td>
        <td>Услуги доступа к платформе Company24.pro по тарифу «${planName}»${period}</td>
        <td class="num">1</td>
        <td class="num">усл.</td>
        <td class="money">${amountRub}</td>
        <td class="money">${amountRub}</td>
      </tr>
    </tbody>
  </table>

  <div class="totals">
    <div><span class="bold">Итого:</span> ${amountRub} руб.</div>
    <div>Без НДС</div>
    <div><span class="bold">Всего оказано услуг на сумму:</span> ${amountRub} руб.</div>
  </div>

  <div class="words">
    Всего оказано услуг на сумму: <span class="bold">${amountWords}</span>
  </div>

  <div class="clause">
    Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.
  </div>

  <div class="sign-block">
    <div class="sign-col">
      <div class="role">Исполнитель</div>
      <div class="sig" style="min-height:56px;">Индивидуальный предприниматель Штумпф Ю. Г.<img src="data:image/png;base64,${signatureBase64}" /></div>
      <div class="line">подпись, расшифровка</div>
    </div>
    <div class="sign-col">
      <div class="role">Заказчик</div>
      <div class="sig" style="min-height:56px;">${buyerName}</div>
      <div class="line">подпись, расшифровка</div>
    </div>
  </div>

  <div class="footer">Акт сформирован автоматически системой Company24.pro</div>

</body>
</html>`
}
