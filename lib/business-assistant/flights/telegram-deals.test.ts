import { test } from "node:test"
import assert from "node:assert/strict"
import { parseTelegramChannelHtml } from "./telegram-deals"

function makePostHtml(postId: string, datetime: string, text: string): string {
  return `
    <div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="${postId}" data-view="x">
      <div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div>
      <a class="tgme_widget_message_date" href="https://t.me/${postId}">
        <time datetime="${datetime}">x</time>
      </a>
    </div>
  `
}

test("извлекает цену, маршрут, дату и ссылку из поста с ценой в рублях", () => {
  const html = makePostHtml(
    "travelradar/1",
    "2026-07-22T16:20:24+00:00",
    "<b>Москва — Анталья </b>от 5000₽ в одну сторону, рейсы прямые",
  )
  const deals = parseTelegramChannelHtml(html, "travelradar")
  assert.equal(deals.length, 1)
  assert.equal(deals[0].priceRub, 5000)
  assert.equal(deals[0].routeFrom, "Москва")
  assert.equal(deals[0].routeTo, "Анталья")
  assert.equal(deals[0].postUrl, "https://t.me/travelradar/1")
  assert.ok(deals[0].postedAt instanceof Date)
})

test("распознаёт формат «из X в Y» и цену через точку-разделитель тысяч", () => {
  const html = makePostHtml(
    "nachemodanah/2",
    "2026-07-23T07:44:32+00:00",
    "✈️Прямые рейсы из Измира в Москву за 12.400 руб на 27 июля",
  )
  const deals = parseTelegramChannelHtml(html, "nachemodanah")
  assert.equal(deals.length, 1)
  assert.equal(deals[0].priceRub, 12400)
  assert.equal(deals[0].routeFrom, "Измира")
  assert.equal(deals[0].routeTo, "Москву")
})

test("распознаёт цену в формате «N тыс. руб.»", () => {
  const html = makePostHtml(
    "travel100500miles/3",
    "2026-07-22T06:02:02+00:00",
    "Самара - Казань в июле-августе — от 5 тыс. руб. в одну сторону",
  )
  const deals = parseTelegramChannelHtml(html, "travel100500miles")
  assert.equal(deals.length, 1)
  assert.equal(deals[0].priceRub, 5000)
  assert.equal(deals[0].routeFrom, "Самара")
  assert.equal(deals[0].routeTo, "Казань")
})

test("пропускает посты без распознанной цены", () => {
  const html = makePostHtml("piratesru/4", "2026-07-22T11:38:03+00:00", "Просто новость без цифр вообще")
  const deals = parseTelegramChannelHtml(html, "piratesru")
  assert.equal(deals.length, 0)
})

test("маршрут остаётся «?», если формат направления не распознан, но цена есть", () => {
  const html = makePostHtml("piratesru/5", "2026-07-22T16:35:00+00:00", "Специальное предложение всего за 12345 руб")
  const deals = parseTelegramChannelHtml(html, "piratesru")
  assert.equal(deals.length, 1)
  assert.equal(deals[0].priceRub, 12345)
  assert.equal(deals[0].routeFrom, "?")
  assert.equal(deals[0].routeTo, "?")
})

test("несколько постов в одном документе парсятся независимо", () => {
  const html =
    makePostHtml("ch/1", "2026-07-22T10:00:00+00:00", "Летим из Москвы в Дубай от 15000₽") +
    makePostHtml("ch/2", "2026-07-22T11:00:00+00:00", "Летим из Питера в Баку от 8000₽")
  const deals = parseTelegramChannelHtml(html, "ch")
  assert.equal(deals.length, 2)
  assert.equal(deals[0].priceRub, 15000)
  assert.equal(deals[1].priceRub, 8000)
})

test("распознаёт цену в евро (€49) — конвертирует по фиксированному курсу-константе", () => {
  const html = makePostHtml("eurotest/1", "2026-07-22T10:00:00+00:00", "Москва — Париж от €49 в одну сторону")
  const deals = parseTelegramChannelHtml(html, "eurotest")
  assert.equal(deals.length, 1)
  assert.equal(deals[0].priceRub, 4900) // 49 * EUR_TO_RUB_RATE (100)
  assert.equal(deals[0].routeFrom, "Москва")
  assert.equal(deals[0].routeTo, "Париж")
})

test("распознаёт цену в долларах ($120) — конвертирует по фиксированному курсу-константе", () => {
  const html = makePostHtml("usdtest/1", "2026-07-22T10:00:00+00:00", "Из Москвы в Нью-Йорк за $120")
  const deals = parseTelegramChannelHtml(html, "usdtest")
  assert.equal(deals.length, 1)
  assert.equal(deals[0].priceRub, 10800) // 120 * USD_TO_RUB_RATE (90)
})

test("при наличии и ₽, и € в одном посте — приоритет у рублёвой цены (не конвертируем зря)", () => {
  const html = makePostHtml(
    "mixed/1",
    "2026-07-22T10:00:00+00:00",
    "Тарифы разные: у нас 5000₽, у партнёра в Европе от €49",
  )
  const deals = parseTelegramChannelHtml(html, "mixed")
  assert.equal(deals.length, 1)
  assert.equal(deals[0].priceRub, 5000)
})
