import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Layers, Plug, Rocket } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import {
  PRODUCT_CATALOG,
  getShowcaseProducts,
  getExternalProducts,
  productHref,
} from "@/lib/products/catalog"
import { getProductIcon } from "@/lib/products/icons"

export const metadata: Metadata = {
  title: "Продукты Company24 — одна платформа вместо зоопарка сервисов",
  description:
    "Найм, база знаний, продажи, реклама и другие продукты Company24 на одной платформе. Подключайте по одному, растите без миграций между сервисами.",
  openGraph: {
    title: "Продукты Company24",
    description:
      "Одна платформа вместо зоопарка сервисов: найм, база знаний, продажи, реклама и другие продукты Company24.",
    type: "website",
  },
}

export default function ProductsHubPage() {
  const products = getShowcaseProducts()
  const external = getExternalProducts()

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

      {/* Hero */}
      <section className="border-b bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">
              Продукты платформы
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Одна платформа вместо зоопарка сервисов
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Найм, база знаний, продажи, реклама — вместо десятка разрозненных
              сервисов один аккаунт, куда продукты подключаются по одному,
              по мере роста бизнеса.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/register">
                  Получить демо
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#products">Смотреть продукты</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Grid */}
      <section id="products" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        <div className="mb-10 flex items-center gap-2">
          <Layers className="h-5 w-5 text-violet-600" />
          <h2 className="text-lg font-semibold">Продукты</h2>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const Icon = getProductIcon(product.icon)
            const isBeta = product.status === "beta"
            return (
              <Link key={product.slug} href={productHref(product)} className="group">
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="h-5 w-5 text-violet-600" />
                      </div>
                      {isBeta && (
                        <Badge variant="outline" className="shrink-0">
                          Скоро
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <h3 className="font-semibold group-hover:text-primary transition-colors">
                      {product.publicName}
                    </h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {product.tagline}
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

          {external.map((product) => {
            const Icon = getProductIcon(product.icon)
            return (
              <a
                key={product.slug}
                href={product.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="group"
              >
                <Card className="h-full border-dashed">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-5 w-5 text-violet-600" />
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        Отдельная платформа
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <h3 className="font-semibold group-hover:text-primary transition-colors">
                      {product.publicName}
                    </h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {product.tagline}
                    </p>
                    <div className="mt-4 flex items-center text-sm font-medium text-primary">
                      Перейти на marketradar24.ru
                      <ArrowRight className="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </CardContent>
                </Card>
              </a>
            )
          })}
        </div>
      </section>

      {/* How it works */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <div className="mb-10 flex items-center gap-2">
            <Plug className="h-5 w-5 text-violet-600" />
            <h2 className="text-lg font-semibold">Как это работает</h2>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                  1
                </div>
                <h3 className="font-semibold">Подключаете один продукт</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Один аккаунт на компанию — начинаете с того, что нужно прямо
                  сейчас, например с найма.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                  2
                </div>
                <h3 className="font-semibold">Подключаете соседние по мере роста</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Кадровый резерв, исходящий поиск, реклама — продукты работают
                  вместе и усиливают друг друга без переезда на другой сервис.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                  3
                </div>
                <h3 className="font-semibold">Растёте без миграций</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Данные, аналитика и команда — в одном месте, даже когда
                  подключена вся платформа целиком.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 md:py-20">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl border bg-card p-10 shadow-sm">
          <Rocket className="h-8 w-8 text-violet-600" />
          <h2 className="text-2xl font-bold tracking-tight">
            Готовы попробовать?
          </h2>
          <p className="text-muted-foreground">
            Оставьте заявку — подключим компанию и покажем платформу на вашем
            примере.
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
