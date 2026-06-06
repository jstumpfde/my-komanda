// Общий хелпер очистки входных данных формы Резерва (используется в POST и PUT).
import type { TalentFormField } from "@/lib/db/schema"

export type FormInput = {
  name?: string; type?: string; source?: string; placement?: string
  slug?: string; slogan?: string; active?: boolean; fields?: unknown
}

export function cleanForm(b: FormInput, companyId: string) {
  const fields: TalentFormField[] = Array.isArray(b.fields)
    ? (b.fields as unknown[])
        .filter((f): f is TalentFormField =>
          !!f && typeof f === "object" && typeof (f as { key?: unknown }).key === "string")
        .map(f => ({
          key: String(f.key), label: String(f.label ?? ""),
          enabled: f.enabled !== false, required: f.required === true,
          ...(f.locked ? { locked: true } : {}),
        }))
    : []
  return {
    companyId,
    name:       String(b.name ?? "").trim().slice(0, 200),
    type:       b.type === "internal" ? "internal" : "external",
    source:     String(b.source ?? "").trim().slice(0, 100),
    placement:  String(b.placement ?? "").trim().slice(0, 200),
    slug:       String(b.slug ?? "").trim().slice(0, 200),
    slogan:     String(b.slogan ?? "").trim().slice(0, 500),
    fieldsJson: fields,
    active:     b.active !== false,
  }
}
