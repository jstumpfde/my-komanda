import { NextResponse } from "next/server"

// Публичный эндпоинт для проверки актуальности сборки.
// Используется StaleDeploymentReload на публичных страницах (демо/тест кандидата):
// клиент сравнивает свой NEXT_PUBLIC_BUILD_ID (вшитый в бандл при сборке) с
// актуальным значением сервера из этого эндпоинта. При расхождении —
// перезагружает страницу (подтягивает свежий бандл).
//
// NEXT_PUBLIC_BUILD_ID инлайнится Next.js при СБОРКЕ и в клиентский бандл, и в
// серверный код. Поэтому этот роут всегда возвращает id ТЕКУЩЕЙ серверной
// сборки. Значение выставляет деплой-скрипт (git-sha).
export const dynamic = "force-dynamic"

export function GET() {
  const buildId = process.env.NEXT_PUBLIC_BUILD_ID || "dev"
  return NextResponse.json({ buildId }, {
    headers: {
      // Не кешировать — каждый запрос должен возвращать текущую версию.
      "Cache-Control": "no-store",
    },
  })
}
