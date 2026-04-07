"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Video, Clock, MapPin, User, Calendar, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"

// Compact interviews view for the overview tab
// Full version at /hr/interviews

interface Interview {
  id: string
  candidate: string
  vacancy: string
  type: "tech" | "hr" | "final"
  format: "online" | "office"
  date: string
  time: string
  status: "confirmed" | "awaiting" | "completed" | "noshow"
}

const TYPE_LABELS: Record<string, string> = { tech: "Техническое", hr: "HR", final: "Финальное" }
const TYPE_COLORS: Record<string, string> = { tech: "bg-blue-500/15 text-blue-700", hr: "bg-violet-500/15 text-violet-700", final: "bg-amber-500/15 text-amber-700" }
const STATUS_LABELS: Record<string, string> = { confirmed: "Подтверждено", awaiting: "Ожидает", completed: "Проведено", noshow: "Не пришёл" }
const STATUS_COLORS: Record<string, string> = { confirmed: "bg-emerald-500/15 text-emerald-700", awaiting: "bg-amber-500/15 text-amber-700", completed: "bg-muted text-muted-foreground", noshow: "bg-red-500/15 text-red-700" }

const INTERVIEWS: Interview[] = [
  { id: "1", candidate: "Иванов Алексей", vacancy: "Менеджер по продажам", type: "tech", format: "online", date: "2 апр", time: "10:00", status: "confirmed" },
  { id: "2", candidate: "Смирнова Елена", vacancy: "Менеджер по продажам", type: "hr", format: "online", date: "2 апр", time: "14:00", status: "confirmed" },
  { id: "3", candidate: "Козлов Игорь", vacancy: "Аккаунт-менеджер", type: "hr", format: "office", date: "3 апр", time: "11:00", status: "awaiting" },
  { id: "4", candidate: "Петров Сергей", vacancy: "Руководитель отдела", type: "final", format: "online", date: "3 апр", time: "15:00", status: "confirmed" },
  { id: "5", candidate: "Белова Анна", vacancy: "Менеджер по продажам", type: "tech", format: "office", date: "4 апр", time: "10:30", status: "awaiting" },
  { id: "6", candidate: "Морозов Дмитрий", vacancy: "Менеджер по продажам", type: "hr", format: "online", date: "1 апр", time: "11:00", status: "noshow" },
  { id: "7", candidate: "Орлова Юлия", vacancy: "Аккаунт-менеджер", type: "final", format: "online", date: "31 мар", time: "16:00", status: "completed" },
]

export default function InterviewsContent() {
  const router = useRouter()

  const upcoming = INTERVIEWS.filter((i) => i.status === "confirmed" || i.status === "awaiting")
  const past = INTERVIEWS.filter((i) => i.status === "completed" || i.status === "noshow")

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground">Ближайшие интервью</h2>
        <Button variant="outline" size="sm" onClick={() => router.push("/hr/interviews")}>
          Все интервью <ExternalLink className="size-3.5 ml-1.5" />
        </Button>
      </div>

      <div className="space-y-2 mb-6">
        {upcoming.map((iv) => (
          <Card key={iv.id} className="cursor-pointer" onClick={() => router.push("/hr/interviews")}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary shrink-0">
                <Video className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{iv.candidate}</p>
                <p className="text-xs text-muted-foreground">{iv.vacancy}</p>
              </div>
              <Badge variant="outline" className={cn("border-0 text-xs", TYPE_COLORS[iv.type])}>
                {TYPE_LABELS[iv.type]}
              </Badge>
              <div className="text-right shrink-0">
                <p className="text-sm font-medium text-foreground">{iv.time}</p>
                <p className="text-xs text-muted-foreground">{iv.date}</p>
              </div>
              <Badge variant="outline" className={cn("border-0 text-xs shrink-0", STATUS_COLORS[iv.status])}>
                {STATUS_LABELS[iv.status]}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      {past.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Прошедшие</h2>
          <div className="space-y-2">
            {past.map((iv) => (
              <Card key={iv.id} className="opacity-60">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="flex items-center justify-center size-10 rounded-lg bg-muted shrink-0">
                    <Video className="size-5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{iv.candidate}</p>
                    <p className="text-xs text-muted-foreground">{iv.vacancy}</p>
                  </div>
                  <Badge variant="outline" className={cn("border-0 text-xs", TYPE_COLORS[iv.type])}>
                    {TYPE_LABELS[iv.type]}
                  </Badge>
                  <div className="text-right shrink-0">
                    <p className="text-sm text-muted-foreground">{iv.time}</p>
                    <p className="text-xs text-muted-foreground">{iv.date}</p>
                  </div>
                  <Badge variant="outline" className={cn("border-0 text-xs shrink-0", STATUS_COLORS[iv.status])}>
                    {STATUS_LABELS[iv.status]}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
