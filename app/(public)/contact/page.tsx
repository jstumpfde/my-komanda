import type { Metadata } from "next"
import { SUPPORT_EMAIL, TELEGRAM_BOT } from "@/lib/constants"

export const metadata: Metadata = {
  title: "Контакты | Company24",
}

export default function ContactPage() {
  const telegramHandle = TELEGRAM_BOT.replace(/^@/, "")
  const telegramUrl = `https://t.me/${telegramHandle}`

  return (
    <div className="min-h-screen bg-gray-950 text-white antialiased flex items-center justify-center px-6">
      <div className="max-w-3xl w-full text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
          Контакты
        </h1>
        <p className="text-lg md:text-xl text-gray-300 leading-relaxed mb-10">
          Свяжитесь с нами удобным способом — мы на связи в рабочее время и быстро отвечаем.
        </p>
        <section className="flex flex-col items-center gap-4 text-lg md:text-xl">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-gray-100 hover:text-white underline-offset-4 hover:underline transition-colors"
          >
            {SUPPORT_EMAIL}
          </a>
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-100 hover:text-white underline-offset-4 hover:underline transition-colors"
          >
            Telegram: {TELEGRAM_BOT}
          </a>
        </section>
      </div>
    </div>
  )
}
