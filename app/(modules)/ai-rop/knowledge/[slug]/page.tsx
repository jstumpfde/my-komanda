import Link from "next/link"
import { redirect, notFound } from "next/navigation"
import { auth } from "@/auth"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { Card, CardContent } from "@/components/ui/card"
import { BookOpen, ArrowLeft } from "lucide-react"
import { getArticle } from "@/lib/ai-rop/knowledge-articles"

/**
 * /ai-rop/knowledge/[slug] — статья Центра знаний AI-РОП.
 * Широкая «гайд»-вёрстка (не узкая блог-колонка). Контент — готовый HTML из
 * lib/ai-rop/knowledge-articles.ts, рендерится через dangerouslySetInnerHTML.
 * Стили .kb-prose (typography-плагин @tailwindcss/typography уже подключён
 * в app/globals.css) + точечный <style> для кастомных классов kb-card/kb-note,
 * которые встречаются в контенте статей — все цвета через CSS-переменные темы.
 */
export default async function AiRopKnowledgeArticlePage(props: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session?.user?.companyId) redirect("/login")

  const { slug } = await props.params
  const article = getArticle(slug)
  if (!article) notFound()

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-4 sm:py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="flex items-center gap-2 pt-3 pb-2">
              <BookOpen className="h-5 w-5 text-violet-600" />
              <h1 className="text-lg font-semibold">Центр знаний</h1>
            </div>

            <div className="mx-auto w-full max-w-[960px]">
              <Link
                href="/ai-rop/knowledge"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-violet-600 transition-colors mb-5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Назад к списку
              </Link>

              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">
                {article.title}
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Обновлено: {article.updated}
              </p>

              <Card>
                <CardContent>
                  <div
                    className="kb-prose prose prose-sm sm:prose-base dark:prose-invert max-w-none prose-headings:font-semibold prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-3 prose-h2:pb-2 prose-h2:border-b prose-h2:border-border first:prose-h2:mt-0 prose-h3:text-base prose-p:leading-relaxed prose-li:leading-relaxed prose-strong:text-foreground prose-a:text-violet-600"
                    dangerouslySetInnerHTML={{ __html: article.html }}
                  />
                  {/*
                    Точечные стили для кастомных классов внутри article.html
                    (kb-card / kb-note), которые typography-плагин не знает.
                    Цвета — только через CSS-переменные темы (light/dark/…
                    подхватываются автоматически, никаких хардкод-hex).
                  */}
                  <style>{`
                    .kb-prose .kb-card {
                      background: var(--muted);
                      border: 1px solid var(--border);
                      border-radius: 0.75rem;
                      padding: 1rem 1.25rem;
                      margin: 1.5rem 0;
                    }
                    .kb-prose .kb-card > *:first-child { margin-top: 0; }
                    .kb-prose .kb-card > *:last-child { margin-bottom: 0; }
                    .kb-prose .kb-note {
                      background: color-mix(in oklch, var(--primary) 8%, transparent);
                      border-left: 3px solid var(--primary);
                      border-radius: 0.5rem;
                      padding: 0.75rem 1rem;
                      margin: 1.25rem 0;
                      font-size: 0.875rem;
                      line-height: 1.5;
                    }
                    .kb-prose .kb-note > *:first-child { margin-top: 0; }
                    .kb-prose .kb-note > *:last-child { margin-bottom: 0; }
                  `}</style>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
