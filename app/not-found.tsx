// Кастомная 404 (App Router). Рендерится внутри корневого layout (с темой).
// Раньше показывалась дефолтная «404: This page could not be found».
import Link from "next/link"

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="text-5xl mb-2">🔍</div>
        <h1 className="text-xl font-semibold mb-2">Страница не найдена</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Возможно, ссылка устарела или раздел переехал. Проверьте адрес или вернитесь на главную.
        </p>
        <Link
          href="/"
          className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
        >
          На главную
        </Link>
      </div>
    </div>
  )
}
