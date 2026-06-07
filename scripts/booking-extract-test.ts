import { readFileSync } from "node:fs"
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}

async function main() {
  const { extractBookingConfirmation } = await import("@/lib/sales/booking-extraction")
  const serviceContextText = `Услуги салона: Маникюр (60 мин, 1500₽), Женская стрижка (60 мин, 2000₽), Педикюр (90 мин, 2200₽). Мастера: Анна, Ольга. Свободно завтра: 11:00, 14:00, 18:00.`
  const res = await extractBookingConfirmation({
    history: [
      { role: "user", text: "Здравствуйте! Хочу записаться на маникюр завтра" },
      { role: "assistant", text: "Здравствуйте! На завтра на маникюр свободно 11:00, 14:00 и 18:00. Какое время удобно?" },
    ],
    latestClientText: "Да, давайте в 14:00",
    latestBotReply: "Отлично, 14:00 на маникюр. Подтверждаю?",
    serviceContextText,
    todayISO: "2026-06-08",
  })
  console.log("extraction:", JSON.stringify(res, null, 2))
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1) })
