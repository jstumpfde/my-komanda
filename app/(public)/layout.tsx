import { CookieBanner } from "@/components/cookie-banner"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <CookieBanner />
    </>
  )
}
