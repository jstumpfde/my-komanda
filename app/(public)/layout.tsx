import { PresenceBeacon } from "@/components/presence-beacon"
import { CookieBanner } from "@/components/cookie-banner"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Маяк присутствия — для платформенного журнала «кто сейчас на сайте»
          (демо/анкеты/вакансии и пр.) и гейта безопасности деплоя. */}
      <PresenceBeacon />
      <CookieBanner />
    </>
  )
}
