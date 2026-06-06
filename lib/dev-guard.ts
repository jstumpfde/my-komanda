// Гард для дев/сид-эндпоинтов (/api/dev/*). Эти ручки наполняют/меняют данные и
// НЕ должны быть доступны обычным пользователям на проде (раньше часть была
// вообще без авторизации или только под requireCompany — любой залогиненный
// пользователь мог запустить сид). Разрешаем только:
//   • не-прод окружение (локальная разработка), ИЛИ
//   • платформенного админа (PLATFORM_ADMIN_EMAILS).
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { isPlatformAdminEmail } from "@/lib/platform/auth"

/** Возвращает 403-Response если доступ запрещён, иначе null (можно продолжать). */
export async function denyIfNotDevAccess(): Promise<NextResponse | null> {
  if (process.env.NODE_ENV !== "production") return null
  const session = await auth().catch(() => null)
  if (isPlatformAdminEmail(session?.user?.email)) return null
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}
