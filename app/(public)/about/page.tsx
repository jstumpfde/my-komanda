import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "О нас | Company24",
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white antialiased flex items-center justify-center px-6">
      <div className="max-w-3xl w-full text-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
          О нас
        </h1>
        <p className="text-lg md:text-xl text-gray-300 leading-relaxed">
          Company24.pro — AI-операционная система для бизнеса. Автоматизация HR, маркетинга, продаж и логистики.
        </p>
      </div>
    </div>
  )
}
