import Link from "next/link"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { BookOpen, ArrowRight } from "lucide-react"
import { KB_ARTICLES } from "@/lib/ai-rop/knowledge-articles"

/**
 * /ai-rop/knowledge — Центр знаний AI-РОП: список материалов (how-to гайды).
 * Открыто любому пользователю компании — это документация, без гейта по роли.
 */
export default async function AiRopKnowledgePage() {
  const session = await auth()
  if (!session?.user?.companyId) redirect("/login")

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
            <p className="text-sm text-muted-foreground mb-6">
              Гайды и инструкции по работе с AI-РОП.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {KB_ARTICLES.map((article) => (
                <Link
                  key={article.slug}
                  href={`/ai-rop/knowledge/${article.slug}`}
                  className="group block h-full"
                >
                  <div className="h-full flex flex-col justify-between rounded-xl border bg-card p-5 transition-colors hover:border-violet-300 dark:hover:border-violet-800 hover:shadow-sm">
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h2 className="text-sm font-semibold leading-snug group-hover:text-violet-600 transition-colors">
                          {article.title}
                        </h2>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-600" />
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {article.excerpt}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground mt-4 pt-3 border-t">
                      Обновлено: {article.updated}
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {KB_ARTICLES.length === 0 && (
              <div className="text-sm text-muted-foreground py-12 text-center">
                Пока нет материалов.
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
