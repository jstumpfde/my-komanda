"use client"

import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Video, Building2, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

type InterviewType = "Техническое" | "HR" | "Финальное"
type InterviewFormat = "Онлайн" | "Офис"
type UpcomingStatus = "Подтверждено" | "Ожидает"
type PastStatus = "Пройдено" | "Не явился"

interface Interview {
  id: number
  day: number
  month: string
  time: string
  candidate: string
  vacancy: string
  interviewer: string
  type: InterviewType
  format: InterviewFormat
  status: UpcomingStatus | PastStatus
}

const upcomingInterviews: Interview[] = [
  {
    id: 1,
    day: 18,
    month: "МАР",
    time: "10:00",
    candidate: "Алексей Морозов",
    vacancy: "Senior Frontend Developer",
    interviewer: "Иван Петров",
    type: "Техническое",
    format: "Онлайн",
    status: "Подтверждено",
  },
  {
    id: 2,
    day: 19,
    month: "МАР",
    time: "14:30",
    candidate: "Мария Соколова",
    vacancy: "Product Manager",
    interviewer: "Елена Смирнова",
    type: "HR",
    format: "Офис",
    status: "Ожидает",
  },
  {
    id: 3,
    day: 21,
    month: "МАР",
    time: "11:00",
    candidate: "Дмитрий Захаров",
    vacancy: "Backend Developer (Go)",
    interviewer: "Андрей Козлов",
    type: "Техническое",
    format: "Онлайн",
    status: "Подтверждено",
  },
  {
    id: 4,
    day: 24,
    month: "МАР",
    time: "15:00",
    candidate: "Ольга Новикова",
    vacancy: "UX Designer",
    interviewer: "Наталья Волкова",
    type: "Финальное",
    format: "Офис",
    status: "Ожидает",
  },
  {
    id: 5,
    day: 26,
    month: "МАР",
    time: "09:30",
    candidate: "Сергей Лебедев",
    vacancy: "DevOps Engineer",
    interviewer: "Кирилл Федоров",
    type: "HR",
    format: "Онлайн",
    status: "Подтверждено",
  },
]

const todayInterviews: Interview[] = [
  {
    id: 6,
    day: 16,
    month: "МАР",
    time: "11:30",
    candidate: "Анна Кузнецова",
    vacancy: "Data Analyst",
    interviewer: "Максим Орлов",
    type: "Техническое",
    format: "Онлайн",
    status: "Подтверждено",
  },
  {
    id: 7,
    day: 16,
    month: "МАР",
    time: "16:00",
    candidate: "Павел Воробьёв",
    vacancy: "QA Engineer",
    interviewer: "Светлана Белова",
    type: "HR",
    format: "Офис",
    status: "Ожидает",
  },
]

const pastInterviews: Interview[] = [
  {
    id: 8,
    day: 14,
    month: "МАР",
    time: "10:00",
    candidate: "Татьяна Михайлова",
    vacancy: "Marketing Specialist",
    interviewer: "Елена Смирнова",
    type: "Финальное",
    format: "Офис",
    status: "Пройдено",
  },
  {
    id: 9,
    day: 12,
    month: "МАР",
    time: "13:00",
    candidate: "Роман Попов",
    vacancy: "iOS Developer",
    interviewer: "Андрей Козлов",
    type: "Техническое",
    format: "Онлайн",
    status: "Не явился",
  },
  {
    id: 10,
    day: 10,
    month: "МАР",
    time: "15:30",
    candidate: "Екатерина Семёнова",
    vacancy: "HR Business Partner",
    interviewer: "Наталья Волкова",
    type: "HR",
    format: "Офис",
    status: "Пройдено",
  },
  {
    id: 11,
    day: 7,
    month: "МАР",
    time: "09:00",
    candidate: "Никита Григорьев",
    vacancy: "Android Developer",
    interviewer: "Кирилл Федоров",
    type: "Финальное",
    format: "Онлайн",
    status: "Пройдено",
  },
]

function typeBadge(type: InterviewType) {
  const styles: Record<InterviewType, string> = {
    Техническое: "bg-blue-100 text-blue-700 border-blue-200",
    HR: "bg-purple-100 text-purple-700 border-purple-200",
    Финальное: "bg-green-100 text-green-700 border-green-200",
  }
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", styles[type])}>
      {type}
    </Badge>
  )
}

function formatBadge(format: InterviewFormat) {
  return (
    <Badge variant="outline" className="text-xs font-medium flex items-center gap-1">
      {format === "Онлайн" ? (
        <Video className="h-3 w-3" />
      ) : (
        <Building2 className="h-3 w-3" />
      )}
      {format}
    </Badge>
  )
}

function statusBadge(status: UpcomingStatus | PastStatus) {
  if (status === "Подтверждено") {
    return (
      <Badge variant="outline" className="text-xs font-medium border-green-400 text-green-600">
        {status}
      </Badge>
    )
  }
  if (status === "Ожидает") {
    return (
      <Badge variant="outline" className="text-xs font-medium border-yellow-400 text-yellow-600">
        {status}
      </Badge>
    )
  }
  if (status === "Пройдено") {
    return (
      <Badge className="text-xs font-medium bg-green-100 text-green-700 hover:bg-green-100">
        {status}
      </Badge>
    )
  }
  // Не явился
  return (
    <Badge className="text-xs font-medium bg-red-100 text-red-700 hover:bg-red-100">
      {status}
    </Badge>
  )
}

function InterviewCard({ interview }: { interview: Interview }) {
  return (
    <Card className="mb-3">
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Date block */}
          <div className="flex flex-col items-center justify-center min-w-[56px] bg-muted rounded-lg py-2 px-3">
            <span className="text-2xl font-bold leading-none">{interview.day}</span>
            <span className="text-[10px] font-medium text-muted-foreground mt-0.5">
              {interview.month}
            </span>
            <span className="text-xs font-semibold text-primary mt-1">{interview.time}</span>
          </div>

          {/* Main info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              <span className="font-semibold text-sm truncate">{interview.candidate}</span>
              {statusBadge(interview.status)}
            </div>
            <p className="text-xs text-muted-foreground truncate mb-1">{interview.vacancy}</p>
            <p className="text-xs text-muted-foreground">
              Интервьюер:{" "}
              <span className="text-foreground font-medium">{interview.interviewer}</span>
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {typeBadge(interview.type)}
              {formatBadge(interview.format)}
            </div>
          </div>

          {/* Action */}
          <div className="flex-shrink-0">
            <Button variant="outline" size="sm" className="flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              Открыть
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function InterviewsPage() {
  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 p-6">
          {/* Page header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Собеседования</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Запланированные и прошедшие интервью
            </p>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="upcoming">
            <TabsList className="mb-4">
              <TabsTrigger value="upcoming">
                Предстоящие
                <Badge className="ml-2 text-xs px-1.5 py-0 h-5 bg-primary/10 text-primary hover:bg-primary/10">
                  {upcomingInterviews.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="today">
                Сегодня
                <Badge className="ml-2 text-xs px-1.5 py-0 h-5 bg-primary/10 text-primary hover:bg-primary/10">
                  {todayInterviews.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="past">
                Прошедшие
                <Badge className="ml-2 text-xs px-1.5 py-0 h-5 bg-primary/10 text-primary hover:bg-primary/10">
                  {pastInterviews.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming">
              {upcomingInterviews.map((interview) => (
                <InterviewCard key={interview.id} interview={interview} />
              ))}
            </TabsContent>

            <TabsContent value="today">
              {todayInterviews.map((interview) => (
                <InterviewCard key={interview.id} interview={interview} />
              ))}
            </TabsContent>

            <TabsContent value="past">
              {pastInterviews.map((interview) => (
                <InterviewCard key={interview.id} interview={interview} />
              ))}
            </TabsContent>
          </Tabs>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
