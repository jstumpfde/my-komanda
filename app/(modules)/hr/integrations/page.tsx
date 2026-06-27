// Дубль убран (Юрий 27.06): управление интеграциями теперь в одном месте —
// «Настройки найма → Интеграции». Старый путь /hr/integrations редиректит туда,
// чтобы существующие ссылки (напр. из карточки кандидата «Переподключить hh»)
// не ломались.

import { redirect } from "next/navigation"

export default function IntegrationsPage() {
  redirect("/hr/hiring-settings?tab=integrations")
}
