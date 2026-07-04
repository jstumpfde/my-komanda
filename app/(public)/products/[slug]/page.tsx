import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ProductLanding } from "@/components/products/product-landing"
import { PRODUCT_CATALOG, getProductBySlug } from "@/lib/products/catalog"

interface PageProps {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return PRODUCT_CATALOG.filter((p) => !p.parentSlug && p.status !== "external").map(
    (p) => ({ slug: p.slug }),
  )
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = getProductBySlug(slug)
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

export default async function ProductLandingPage({ params }: PageProps) {
  const { slug } = await params
  const product = getProductBySlug(slug)
  if (!product || product.status === "external") notFound()

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
      <ProductLanding product={product} />
    </>
  )
}
