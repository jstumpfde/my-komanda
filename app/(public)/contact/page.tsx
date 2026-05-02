import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Контакты | Company24",
  description:
    "Свяжитесь с командой Company24.pro по любым вопросам — мы всегда на связи.",
}

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white antialiased flex items-center justify-center px-6">
      <div className="max-w-3xl w-full text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
          Контакты
        </h1>
        <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
          Свяжитесь с нами по почте:{" "}
          <a
            href="mailto:hello@company24.pro"
            className="text-indigo-400 hover:text-indigo-300 underline underline-offset-4"
          >
            hello@company24.pro
          </a>
          .
        </p>
      </div>
    </div>
  )
}
