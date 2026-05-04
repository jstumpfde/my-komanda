/**
 * create-tester-hr-user.ts
 *
 * Создаёт (или ресетит пароль) пользователя с ролью `tester_hr` —
 * view-only доступ к HR-модулю для тестирования без права создавать
 * вакансии, удалять кандидатов или рассылать сообщения.
 *
 * Идемпотентен: если email уже существует, обновляет пароль и роль.
 *
 * Запуск:
 *   npx tsx scripts/create-tester-hr-user.ts
 *   npx tsx scripts/create-tester-hr-user.ts custom@example.com
 *   npx tsx scripts/create-tester-hr-user.ts custom@example.com <companyId>
 */

import crypto from "crypto"
import { eq, asc } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { db, pgClient } from "@/lib/db"
import { users, companies } from "@/lib/db/schema"

const DEFAULT_EMAIL = "tester-hr@company24.pro"
const ROLE = "tester_hr"

function generatePassword(length = 12): string {
  // crypto-safe пароль: буквы (без двусмысленных) + цифры
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"
  const bytes = crypto.randomBytes(length)
  let out = ""
  for (let i = 0; i < length; i++) out += alphabet[bytes[i] % alphabet.length]
  return out
}

async function pickCompanyId(arg?: string): Promise<string> {
  if (arg) {
    const [c] = await db.select({ id: companies.id, name: companies.name })
      .from(companies).where(eq(companies.id, arg)).limit(1)
    if (!c) throw new Error(`Компания с id=${arg} не найдена`)
    console.log(`📌 Использую компанию: ${c.name} (${c.id})`)
    return c.id
  }
  const [first] = await db.select({ id: companies.id, name: companies.name })
    .from(companies).orderBy(asc(companies.createdAt)).limit(1)
  if (!first) throw new Error("В БД нет ни одной компании")
  console.log(`📌 Использую первую компанию: ${first.name} (${first.id})`)
  return first.id
}

async function main() {
  const email = (process.argv[2] ?? DEFAULT_EMAIL).trim().toLowerCase()
  const companyArg = process.argv[3]

  const companyId = await pickCompanyId(companyArg)
  const password = generatePassword(12)
  const passwordHash = await bcrypt.hash(password, 10)

  const [existing] = await db.select({ id: users.id })
    .from(users).where(eq(users.email, email)).limit(1)

  if (existing) {
    await db.update(users)
      .set({ passwordHash, role: ROLE, companyId, isActive: true, name: "Тестировщик HR" })
      .where(eq(users.id, existing.id))
    console.log("✅ Пользователь обновлён (новый пароль/роль).")
  } else {
    await db.insert(users).values({
      email,
      name: "Тестировщик HR",
      passwordHash,
      role: ROLE,
      companyId,
      isActive: true,
    })
    console.log("✅ Пользователь создан.")
  }

  console.log("\n────────── Учётные данные ──────────")
  console.log(`  Email:    ${email}`)
  console.log(`  Пароль:   ${password}`)
  console.log(`  Роль:     ${ROLE} (Тестировщик HR — view-only HR)`)
  console.log("────────────────────────────────────\n")
  console.log("⚠️  Сохраните пароль в надёжном месте — он не будет показан повторно.\n")
}

main()
  .catch((err) => {
    console.error("❌ Ошибка:", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await pgClient.end()
  })
