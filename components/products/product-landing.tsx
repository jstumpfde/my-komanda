import Link from "next/link"
import { ArrowRight, ChevronRight, HelpCircle, Layers, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import {
  PRODUCT_CATALOG,
  productHref,
  resolveWorksWith,
  type ProductPublicManifest,
} from "@/lib/products/catalog"
import { getProductIcon } from "@/lib/products/icons"

interface ProductLandingProps {
  product: ProductPublicManifest
  /** Родительский манифест — передаётся для сателлитов, рисует хлебную крошку */
  parent?: ProductPublicManifest
}

export function ProductLanding({ product, parent }: ProductLandingProps) {
  const Icon = getProductIcon(product.icon)
  const isBeta = product.status === "beta"
  const related = resolveWorksWith(product.worksWith)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              C
            </div>
            <span className="text-lg font-semibold">Company24</span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Войти</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Получить демо</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="border-b bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Link href="/products" className="hover:text-foreground">
              Продукты
            </Link>
            {parent && (
              <>
                <ChevronRight className="h-3.5 w-3.5" />
                <Link href={productHref(parent)} className="hover:text-foreground">
                  {parent.publicName}
                </Link>
              </>
            )}
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">{product.publicName}</span>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <section className="border-b bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 flex items-center justify-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <Icon className="h-6 w-6 text-violet-600" />
              </div>
            </div>
            <div className="mb-3 flex items-center justify-center gap-2">
              <Badge variant="secondary">{product.publicName}</Badge>
              {isBeta && <Badge variant="outline">Скоро</Badge>}
              {parent && <Badge variant="outline">Часть {parent.publicName}</Badge>}
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              {product.heroTitle}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              {product.heroSubtitle}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/register">
                  Получить демо
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/products">Все продукты</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Pain points */}
      {product.painPoints.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mb-10 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-semibold">Знакомая ситуация?</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {product.painPoints.map((pain, i) => (
              <Card key={i}>
                <CardContent className="pt-6">
                  <p className="text-sm leading-relaxed">{pain}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Features */}
      {product.features.length > 0 && (
        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <div className="mb-10 flex items-center gap-2">
              <Layers className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-semibold">Что внутри</h2>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {product.features.map((feature) => (
                <Card key={feature.title}>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold">{feature.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Works with */}
      {related.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mb-10 flex items-center gap-2">
            <Layers className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-semibold">Работает вместе с</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => {
              const RIcon = getProductIcon(r.icon)
              return (
                <Link key={r.slug} href={productHref(r)} className="group">
                  <Card className="h-full">
                    <CardHeader>
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <RIcon className="h-5 w-5 text-violet-600" />
                      </div>
                    </CardHeader>
                    <CardContent>
                      <h3 className="font-semibold group-hover:text-primary transition-colors">
                        {r.publicName}
                      </h3>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        {r.tagline}
                      </p>
                      <div className="mt-4 flex items-center text-sm font-medium text-primary">
                        Подробнее
                        <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* FAQ */}
      {product.faq.length > 0 && (
        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-20">
            <div className="mb-10 flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-violet-600" />
              <h2 className="text-lg font-semibold">Частые вопросы</h2>
            </div>
            <Card>
              <CardContent className="pt-6">
                <Accordion type="single" collapsible className="w-full">
                  {product.faq.map((item, i) => (
                    <AccordionItem key={i} value={`faq-${i}`}>
                      <AccordionTrigger>{item.q}</AccordionTrigger>
                      <AccordionContent className="text-muted-foreground">
                        {item.a}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 md:py-20">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border bg-card p-10 shadow-sm">
          <Icon className="h-8 w-8 text-violet-600" />
          <h2 className="text-2xl font-bold tracking-tight">
            Готовы попробовать {product.publicName}?
          </h2>
          <p className="text-muted-foreground">
            Оставьте заявку — покажем продукт на вашем примере и подключим
            компанию.
          </p>
          <Button size="lg" asChild>
            <Link href="/register">
              Получить демо
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} Company24. Все права защищены.
            </p>
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              {PRODUCT_CATALOG.filter((p) => !p.parentSlug).map((p) => (
                <Link
                  key={p.slug}
                  href={productHref(p)}
                  className="hover:text-foreground"
                  target={p.status === "external" ? "_blank" : undefined}
                  rel={p.status === "external" ? "noopener noreferrer" : undefined}
                >
                  {p.publicName}
                </Link>
              ))}
              <Link href="/privacy" className="hover:text-foreground">
                Конфиденциальность
              </Link>
              <Link href="/terms" className="hover:text-foreground">
                Оферта
              </Link>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  )
}
