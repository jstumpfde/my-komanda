"use client"

// Таб «Компании и продукты»: продукты вложены ВНУТРЬ карточки каждой компании.
// Идентичность + список компаний — MultiCompanyBlock, редактор продуктов
// инжектится в карточку каждой компании через renderProducts. Сверху — кнопка
// «Заполнить из сайта» (Фаза 1 онбординга: AI читает сайт → профиль + описание).

import { useState } from "react"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MultiCompanyBlock } from "@/components/hiring-settings/service-section"
import { ProductProfilesEditor } from "@/components/hiring-settings/product-profile-section"
import { BootstrapFromSiteDialog } from "@/components/hiring-settings/bootstrap-from-site-dialog"
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import type { ProductProfile } from "@/lib/hiring/product-profile"

export function CompaniesProductsSection({ defaults, onPatch }: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
  const [bootstrapOpen, setBootstrapOpen] = useState(false)

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
    <div className="max-w-3xl space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setBootstrapOpen(true)} className="gap-1.5">
          <Sparkles className="w-4 h-4 text-primary" /> Заполнить из сайта
        </Button>
      </div>

      <MultiCompanyBlock defaults={defaults} onPatch={onPatch} renderProducts={renderProducts} />

      <BootstrapFromSiteDialog
        open={bootstrapOpen}
        onOpenChange={setBootstrapOpen}
        hasExistingProducts={(defaults.productProfiles?.length ?? 0) > 0}
        onPatch={onPatch}
        onApplied={() => { if (typeof window !== "undefined") window.location.reload() }}
      />
    </div>
  )
}
