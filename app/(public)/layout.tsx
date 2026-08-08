import { PresenceBeacon } from "@/components/presence-beacon"
import { CookieConsentBanner } from "@/components/cookie-consent-banner"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* Маяк присутствия — для платформенного журнала «кто сейчас на сайте»
          (демо/анкеты/вакансии и пр.) и гейта безопасности деплоя. */}
      <PresenceBeacon />
      <CookieConsentBanner />
    </>
  )
}
