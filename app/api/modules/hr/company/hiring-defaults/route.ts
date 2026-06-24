import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { companies, type CompanyHiringDefaults } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireCompany } from "@/lib/api-helpers";
import { logAudit } from "@/lib/audit/log";

// GET — текущие дефолты найма компании
export async function GET() {
  try {
    const ctx = await requireCompany();

    const [company] = await db
      .select({ hiringDefaultsJson: companies.hiringDefaultsJson })
      .from(companies)
      .where(eq(companies.id, ctx.companyId));

    return NextResponse.json({
      hiringDefaults: (company?.hiringDefaultsJson ?? {}) as CompanyHiringDefaults,
    });
  } catch (err) {
    // requireCompany бросает apiError (NextResponse) при 401/403 — возвращаем его,
    // иначе клиент получил бы 500 вместо чистого статуса.
    if (err instanceof Response) return err;
    throw err;
  }
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
  "feedbackSurveys",
  "dashboardCards",
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
  try {
  const ctx = await requireCompany();

  const patch = (await req.json().catch(() => ({}))) as Partial<CompanyHiringDefaults>;

  // Интеграции уровня компании (webhooks/bitrix) рассылают данные наружу —
  // менять их может только директор (иначе hr_lead мог бы увести уведомления
  // на свой сервер). Аналогично rolePermissions/candidateColumns ниже.
  if (("webhooks" in patch || "bitrix" in patch) &&
      !["director", "client", "platform_admin", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Только директор компании может менять интеграции" }, { status: 403 });
  }

  // --- Defense-in-depth: размерные лимиты ---

  // 1. Общий размер patch — не более 1.5 МБ
  const PATCH_MAX_BYTES = 1_500_000; // 1.5 МБ
  if (JSON.stringify(patch).length > PATCH_MAX_BYTES) {
    return NextResponse.json(
      { error: "Слишком большой запрос (максимум 1.5 МБ)" },
      { status: 413 }
    );
  }

  // 2. brandCompanies: лимиты количества и суммарного размера логотипов
  if (patch.brandCompanies !== undefined) {
    const brands = patch.brandCompanies as Array<{ id?: unknown; name?: unknown; logo?: string; [k: string]: unknown }>;

    if (!Array.isArray(brands)) {
      return NextResponse.json(
        { error: "brandCompanies должен быть массивом" },
        { status: 400 }
      );
    }

    // 2a. Не более 30 компаний
    const BRAND_MAX_COUNT = 30;
    if (brands.length > BRAND_MAX_COUNT) {
      return NextResponse.json(
        { error: `Слишком много компаний (максимум ${BRAND_MAX_COUNT})` },
        { status: 400 }
      );
    }

    // 2b. Суммарная длина всех logo-строк — не более ~600 КБ
    const LOGO_MAX_TOTAL_BYTES = 600_000; // ~600 КБ
    const totalLogoLength = brands.reduce((sum, b) => {
      return sum + (typeof b.logo === "string" ? b.logo.length : 0);
    }, 0);
    if (totalLogoLength > LOGO_MAX_TOTAL_BYTES) {
      return NextResponse.json(
        { error: "Слишком большой размер логотипов — загрузите файл через форму" },
        { status: 400 }
      );
    }
  }

  // --- конец лимитов ---

  // rolePermissions — компанийская настройка («Роли и доступ»), её меняет только
  // директор. Остальные ключи (воронка/автоматизация/опросы) доступны HR-модулю.
  if ("rolePermissions" in patch &&
      !["director", "client", "platform_admin", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Только директор может менять права ролей" }, { status: 403 });
  }

  // B5: candidateColumns — единые колонки списка кандидатов; меняет только директор/platform_admin.
  if ("candidateColumns" in patch &&
      !["director", "client", "platform_admin", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Только директор компании может настраивать колонки" }, { status: 403 });
  }

  const [company] = await db
    .select({ hiringDefaultsJson: companies.hiringDefaultsJson })
    .from(companies)
    .where(eq(companies.id, ctx.companyId));

  const current = (company?.hiringDefaultsJson ?? {}) as CompanyHiringDefaults;
  const merged = mergeDefaults(current, patch);

  // ТЗ №1: профиль продукта живёт только в hiring_defaults_json и НЕ связан с
  // вакансией/sales-модулем. companies.is_multi_product сознательно НЕ трогаем
  // отсюда — этот флаг читает мастер создания вакансии (меняет копирайт шага
  // «Продукт»), и запись из настроек найма тихо меняла бы его поток.
  await db
    .update(companies)
    .set({ hiringDefaultsJson: merged })
    .where(eq(companies.id, ctx.companyId));

  // O3: аудит изменения срока хранения ПДн (ФЗ-152).
  if ("dataRetention" in patch && patch.dataRetention !== current.dataRetention) {
    void logAudit({
      tenantId:   ctx.companyId,
      userId:     ctx.id,
      userEmail:  ctx.email ?? null,
      action:     "data_retention_change",
      entityType: "company",
      entityId:   ctx.companyId,
      meta: {
        oldValue: current.dataRetention ?? null,
        newValue: patch.dataRetention,
      },
    });
  }

  return NextResponse.json({ hiringDefaults: merged });
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }
}
