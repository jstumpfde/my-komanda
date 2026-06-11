// Старая заглушка «Источники кандидатов» («В разработке»). Реальный функционал
// живёт в табе «Источники» внутри вакансии и в /hr/hiring-settings → «Интеграции».
// Чтобы прямой URL не упирался в пустой экран — редиректим на настройки найма.
import { redirect } from "next/navigation"

export default function SourcesRedirectPage() {
  redirect("/hr/hiring-settings?tab=integrations")
}
