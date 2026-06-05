import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { companies, type CompanyHiringDefaults } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireCompany } from "@/lib/api-helpers";

// GET — текущие дефолты найма компании
export async function GET() {
  const ctx = await requireCompany();
  if (ctx instanceof NextResponse) return ctx;

  const [company] = await db
    .select({ hiringDefaultsJson: companies.hiringDefaultsJson })
    .from(companies)
    .where(eq(companies.id, ctx.companyId));

  return NextResponse.json({
    hiringDefaults: (company?.hiringDefaultsJson ?? {}) as CompanyHiringDefaults,
  });
}

// Глубокий мердж на уровне верхних ключей-объектов, чтобы частичный
// патч одной карточки не затирал соседние.
const NESTED_KEYS: (keyof CompanyHiringDefaults)[] = [
  "schedule",
  "automation",
  "webhooks",
  "bitrix",
  "stopFactorsDefaults",
  "rolePermissions",
];

function mergeDefaults(
  current: CompanyHiringDefaults,
  patch: Partial<CompanyHiringDefaults>
): CompanyHiringDefaults {
  const result: CompanyHiringDefaults = { ...current };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (
      NESTED_KEYS.includes(key as keyof CompanyHiringDefaults) &&
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      const prev = (current[key as keyof CompanyHiringDefaults] ?? {}) as Record<string, unknown>;
      (result as Record<string, unknown>)[key] = { ...prev, ...(value as Record<string, unknown>) };
    } else {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}

// PATCH — частичное обновление дефолтов найма (deep-merge верхних ключей)
export async function PATCH(req: NextRequest) {
  const ctx = await requireCompany();
  if (ctx instanceof NextResponse) return ctx;

  const patch = (await req.json().catch(() => ({}))) as Partial<CompanyHiringDefaults>;

  // rolePermissions — компанийская настройка («Роли и доступ»), её меняет только
  // директор. Остальные ключи (воронка/автоматизация/опросы) доступны HR-модулю.
  if ("rolePermissions" in patch &&
      !["director", "client", "platform_admin", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Только директор может менять права ролей" }, { status: 403 });
  }

  const [company] = await db
    .select({ hiringDefaultsJson: companies.hiringDefaultsJson })
    .from(companies)
    .where(eq(companies.id, ctx.companyId));

  const current = (company?.hiringDefaultsJson ?? {}) as CompanyHiringDefaults;
  const merged = mergeDefaults(current, patch);

  await db
    .update(companies)
    .set({ hiringDefaultsJson: merged })
    .where(eq(companies.id, ctx.companyId));

  return NextResponse.json({ hiringDefaults: merged });
}
