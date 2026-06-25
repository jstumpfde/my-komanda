"use client"

// Таб «Компании»: идентичность компаний/брендов (MultiCompanyBlock) +
// продукты ПОД КАЖДОЙ компанией (решение Юрия — «подчинить продукты в компанию»).
// Главная компания → hiring_defaults_json.productProfiles; доп.бренды →
// brandProductProfiles[brandId]. Отдельного таба «Профиль продукта» больше нет.

import { Building2 } from "lucide-react"
import { MultiCompanyBlock } from "@/components/hiring-settings/service-section"
import { ProductProfilesEditor } from "@/components/hiring-settings/product-profile-section"
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import type { ProductProfile } from "@/lib/hiring/product-profile"

export function CompaniesProductsSection({ defaults, onPatch }: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
  // Продукты доп.брендов показываем только в режиме мультикомпании. Без него
  // компания одна — нужны только продукты основной (иначе пустые/случайные
  // бренды плодят лишние редакторы продуктов).
  const brands = defaults.showCompanySelector && Array.isArray(defaults.brandCompanies)
    ? defaults.brandCompanies.filter((b) => (b?.name ?? "").trim() !== "")
    : []

  // Сохранение продуктов основной компании (productProfiles — top-level массив).
  const saveMain = (profiles: ProductProfile[], defaultId: string) =>
    onPatch({ productProfiles: profiles, defaultProductProfileId: defaultId })

  // Сохранение продуктов бренда: brandProductProfiles — НЕ nested-ключ, шлём
  // полную карту с обновлённым брендом (читаем текущую из defaults).
  const saveBrand = (brandId: string) => (profiles: ProductProfile[], defaultId: string) =>
    onPatch({
      brandProductProfiles: { ...(defaults.brandProductProfiles ?? {}), [brandId]: profiles },
      brandDefaultProductProfileIds: { ...(defaults.brandDefaultProductProfileIds ?? {}), [brandId]: defaultId },
    })

  return (
    <div className="space-y-5">
      {/* Идентичность: мультикомпания / бренды */}
      <MultiCompanyBlock defaults={defaults} onPatch={onPatch} />

      {/* Продукты основной компании */}
      <ProductProfilesEditor
        title="Продукты — основная компания"
        description="Что и кому продаёт основная компания. Найм использует это для генерации анкет и критериев оценки под продажников и клиентоориентированные роли."
        value={defaults.productProfiles}
        defaultId={defaults.defaultProductProfileId}
        onSave={saveMain}
      />

      {/* Продукты доп.брендов (мультикомпания) */}
      {brands.map((b) => (
        <ProductProfilesEditor
          key={b.id}
          title={`Продукты — ${b.name || "бренд"}`}
          description="Продукты этого бренда. Применяются при найме под эту компанию."
          value={defaults.brandProductProfiles?.[b.id]}
          defaultId={defaults.brandDefaultProductProfileIds?.[b.id]}
          onSave={saveBrand(b.id)}
        />
      ))}

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Building2 className="w-3.5 h-3.5 shrink-0" />
        У каждой компании — свой набор продуктов. Добавьте бренды выше, чтобы вести найм под несколько компаний.
      </p>
    </div>
  )
}
