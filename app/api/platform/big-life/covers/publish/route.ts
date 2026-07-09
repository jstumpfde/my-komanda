// Публикация архива обложек: перегенерировать "Big Life Covers.dc.html" из
// текущих строк big_life_covers и записать файл напрямую на диск —
// my-komanda и статика biglife.company24.pro живут на одной машине, поэтому
// без rsync/ssh (см. lib/big-life/paths.ts). В dev (нет BIGLIFE_STATIC_DIR и
// нет прод-пути) — no-op с понятным ответом, а не падение.
import { NextResponse } from "next/server"
import fs from "fs/promises"
import { db } from "@/lib/db"
import { bigLifeCovers } from "@/lib/db/schema"
import { requirePlatformOperator } from "@/lib/platform/auth"
import { renderCoversPage } from "@/lib/big-life/render-covers-page"
import { bigLifeDir } from "@/lib/big-life/paths"

export const dynamic = "force-dynamic"

export async function POST() {
  try {
    await requirePlatformOperator()
  } catch (e) {
    if (e instanceof Response) return e
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const rows = await db.select().from(bigLifeCovers)
    const html = renderCoversPage(rows)
    const target = bigLifeDir("Big Life Covers.dc.html")

    try {
      await fs.access(bigLifeDir())
    } catch {
      return NextResponse.json(
        { error: `Каталог biglife не найден (${bigLifeDir()}) — публикация недоступна в этом окружении` },
        { status: 501 }
      )
    }

    await fs.writeFile(target, html, "utf-8")
    return NextResponse.json({ ok: true, path: target, count: rows.filter(r => r.isActive).length })
  } catch (err) {
    console.error("[platform/big-life/covers/publish POST]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
