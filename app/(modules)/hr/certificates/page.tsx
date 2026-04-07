"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Award, BookOpen, Calendar, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"

interface Certificate {
  id: string
  number: string
  issuedAt: string
  validUntil: string | null
  pdfUrl: string | null
  employeeId: string
  courseId: string
  courseTitle: string
}

export default function CertificatesPage() {
  const [certs, setCerts] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/certificates")
      .then(r => r.json())
      .then(setCerts)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <SidebarProvider><DashboardSidebar /><SidebarInset><DashboardHeader />
    <div className="p-6 text-sm text-muted-foreground">Загрузка...</div>
    </SidebarInset></SidebarProvider>
  )

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Сертификаты</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Выданные сертификаты об окончании курсов</p>
      </div>

      {certs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Award className="size-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Сертификатов пока нет</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Завершите курс, чтобы получить сертификат</p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link href="/hr/courses">К каталогу курсов</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {certs.map(cert => (
            <Card key={cert.id}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="flex items-center justify-center size-10 rounded-lg bg-yellow-50 shrink-0">
                    <Award className="size-5 text-yellow-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-snug">{cert.courseTitle}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">№ {cert.number}</p>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="size-3.5" />
                    Выдан: {new Date(cert.issuedAt).toLocaleDateString("ru-RU")}
                  </div>
                  {cert.validUntil && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      Действителен до: {new Date(cert.validUntil).toLocaleDateString("ru-RU")}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 h-7 text-xs" asChild>
                    <Link href={`/hr/courses/${cert.courseId}/learn`}>
                      <BookOpen className="size-3 mr-1" />
                      Курс
                    </Link>
                  </Button>
                  {cert.pdfUrl ? (
                    <Button size="sm" className="flex-1 h-7 text-xs" asChild>
                      <a href={cert.pdfUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="size-3 mr-1" />
                        Скачать
                      </a>
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" className="flex-1 h-7 text-xs" disabled>
                      PDF скоро
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
    </SidebarInset>
    </SidebarProvider>
  )
}
