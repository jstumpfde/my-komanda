import { Bot } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface AgentRow {
  role: string
  model: string
  status: string
  statusVariant: "active" | "info"
}

const AGENTS: AgentRow[] = [
  { role: "Координатор", model: "Sonnet 4.6", status: "Активен", statusVariant: "active" },
  { role: "Исполнитель", model: "Opus 4.7", status: "Активен", statusVariant: "active" },
  { role: "Worker", model: "Active", status: "24/7", statusVariant: "info" },
]

export default function AgentsPage() {
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
                  <Bot className="h-6 w-6 text-primary" />
                  AI-агенты
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Состав агент-системы и текущие статусы
                </p>
              </div>
            </div>

            {/* Table */}
            <Card className="rounded-xl border border-border shadow-sm bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3">
                      Роль
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3">
                      Модель
                    </TableHead>
                    <TableHead className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider px-5 py-3">
                      Статус
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {AGENTS.map((agent) => (
                    <TableRow
                      key={agent.role}
                      className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                    >
                      <TableCell className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-primary shrink-0" />
                          <span className="font-medium text-sm">{agent.role}</span>
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-3 text-sm text-muted-foreground">
                        {agent.model}
                      </TableCell>
                      <TableCell className="px-5 py-3">
                        {agent.statusVariant === "active" ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300">
                            {agent.status}
                          </Badge>
                        ) : (
                          <Badge variant="outline">{agent.status}</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
