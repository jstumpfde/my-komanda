import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Политика конфиденциальности | Company24",
  description:
    "Company24.pro обрабатывает персональные данные согласно ФЗ-152.",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white antialiased flex items-center justify-center px-6">
      <div className="max-w-3xl w-full text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
          Политика конфиденциальности
        </h1>
        <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
          Company24.pro обрабатывает персональные данные согласно ФЗ-152.
          Подробности у{" "}
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
