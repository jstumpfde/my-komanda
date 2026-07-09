// /admin/platform/big-life-covers — управление архивом обложек Big Life
// (biglife.company24.pro/Big Life Covers.dc.html): цена, скидка, остаток,
// «нет в наличии», публикация. Доступ ограничен layout'ом /admin/platform.

import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { BigLifeCoversClient } from "./big-life-covers-client"

export const dynamic = "force-dynamic"

export default function BigLifeCoversPage() {
  return (
    <AdminPageLayout>
      <BigLifeCoversClient />
    </AdminPageLayout>
  )
}
