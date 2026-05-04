import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Условия использования | Company24",
  description:
    "Используя Company24.pro, вы соглашаетесь с условиями использования сервиса.",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white antialiased flex items-center justify-center px-6">
      <div className="max-w-3xl w-full text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
          Условия использования
        </h1>
        <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
          Используя Company24.pro, вы соглашаетесь с условиями. Полная версия:{" "}
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
