import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ProductLanding } from "@/components/products/product-landing"
import {
  PRODUCT_CATALOG,
  getProductBySlug,
  getSatelliteBySlugs,
  getSatellites,
} from "@/lib/products/catalog"

interface PageProps {
  params: Promise<{ slug: string; child: string }>
}

export function generateStaticParams() {
  const params: { slug: string; child: string }[] = []
  for (const parent of PRODUCT_CATALOG.filter((p) => !p.parentSlug)) {
    for (const child of getSatellites(parent.slug)) {
      params.push({ slug: parent.slug, child: child.slug })
    }
  }
  return params
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, child } = await params
  const product = getSatelliteBySlugs(slug, child)
  if (!product) return {}

  return {
    title: `${product.publicName} — ${product.tagline}`,
    description: product.shortDescription,
    openGraph: {
      title: product.publicName,
      description: product.shortDescription,
      type: "website",
    },
  }
}

export default async function ProductSatellitePage({ params }: PageProps) {
  const { slug, child } = await params
  const parent = getProductBySlug(slug)
  const product = getSatelliteBySlugs(slug, child)
  if (!parent || !product) notFound()

  const faqJsonLd =
    product.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: product.faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: {
              "@type": "Answer",
              text: item.a,
            },
          })),
        }
      : null

  return (
    <>
      {faqJsonLd && (
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      <ProductLanding product={product} parent={parent} />
    </>
  )
}
