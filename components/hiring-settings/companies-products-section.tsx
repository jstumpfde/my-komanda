"use client"

// Таб «Компании и продукты»: продукты вложены ВНУТРЬ карточки каждой компании
// (решение Юрия). Идентичность + список компаний — MultiCompanyBlock, а редактор
// продуктов инжектится в карточку каждой компании через renderProducts.
// Главная компания → hiring_defaults_json.productProfiles; доп.бренды →
// brandProductProfiles[brandId].

import { MultiCompanyBlock } from "@/components/hiring-settings/service-section"
import { ProductProfilesEditor } from "@/components/hiring-settings/product-profile-section"
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import type { ProductProfile } from "@/lib/hiring/product-profile"

export function CompaniesProductsSection({ defaults, onPatch }: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
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

  // Редактор продуктов для конкретной компании (инжектится в её карточку).
  const renderProducts = (companyKey: string) => companyKey === ""
    ? (
      <ProductProfilesEditor
        title="Продукты компании"
        description="Что и кому продаёт эта компания. Найм использует это для генерации анкет и критериев оценки."
        value={defaults.productProfiles}
        defaultId={defaults.defaultProductProfileId}
        onSave={saveMain}
      />
    )
    : (
      <ProductProfilesEditor
        title="Продукты компании"
        description="Продукты этого бренда. Применяются при найме под эту компанию."
        value={defaults.brandProductProfiles?.[companyKey]}
        defaultId={defaults.brandDefaultProductProfileIds?.[companyKey]}
        onSave={saveBrand(companyKey)}
      />
    )

  return (
    <MultiCompanyBlock defaults={defaults} onPatch={onPatch} renderProducts={renderProducts} />
  )
}
