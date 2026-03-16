"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Users,
  Calendar,
  BarChart3,
  ChevronDown,
  Briefcase,
  GripVertical,
  Edit2,
  UserCheck,
  GraduationCap,
  UserPlus,
  BookOpen,
  Plus,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getVacancyCategories,
  updateVacancyCategory,
  reorderCategories,
  reorderCategoryItems,
  getIconComponent,
  iconMap,
  type VacancyCategory,
} from "@/lib/vacancy-storage"
import { cn } from "@/lib/utils"
import { CreateVacancyDialog } from "./create-vacancy-dialog"

const mainNavItems = [
  { name: "Обзор", icon: LayoutDashboard, href: "/" },
  { name: "Все кандидаты", icon: Users, href: "/candidates" },
  { name: "Собеседования", icon: Calendar, href: "/interviews" },
  { name: "Аналитика", icon: BarChart3, href: "/analytics" },
]

const onboardingItems = [
  { id: "trainee-1", name: "Стажёр по продажам", count: 3 },
  { id: "trainee-2", name: "Стажёр IT отдела", count: 2 },
  { id: "trainee-3", name: "Стажёр маркетинга", count: 1 },
]

const trainingItems = [
  { id: "emp-1", name: "Новые сотрудники", count: 8 },
  { id: "emp-2", name: "Повышение квалификации", count: 12 },
  { id: "emp-3", name: "Обучение продукту", count: 5 },
]

interface CategoryEditState {
  id: string
  name: string
  iconName: string
}

interface DragState {
  type: "category" | "vacancy"
  categoryId?: string
  index: number
}

export function DashboardSidebar() {
  const pathname = usePathname()
  const [categories, setCategories] = useState<VacancyCategory[]>([])
  const [createVacancyOpen, setCreateVacancyOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategoryEditState | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dragOverVacancy, setDragOverVacancy] = useState<{ categoryId: string; index: number } | null>(null)

  useEffect(() => {
    setCategories(getVacancyCategories())
  }, [])

  const handleOpenEdit = (id: string, name: string, iconName: string) => {
    setEditingCategory({ id, name, iconName })
  }

  const handleSaveEdit = () => {
    if (editingCategory) {
      updateVacancyCategory(editingCategory.id, {
        name: editingCategory.name,
        iconName: editingCategory.iconName,
        icon: editingCategory.iconName,
      })
      setCategories(getVacancyCategories())
      setEditingCategory(null)
    }
  }

  const handleDragStart = (type: "category" | "vacancy", index: number, categoryId?: string) => {
    setDragState({ type, index, categoryId })
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDragEnterCategory = (index: number) => {
    if (dragState?.type === "category") {
      setDragOverIndex(index)
    }
  }

  const handleDragEnterVacancy = (categoryId: string, index: number) => {
    if (dragState?.type === "vacancy" && dragState.categoryId === categoryId) {
      setDragOverVacancy({ categoryId, index })
    }
  }

  const handleDropCategory = (targetIndex: number) => {
    if (dragState?.type === "category" && dragState.index !== targetIndex) {
      reorderCategories(dragState.index, targetIndex)
      setCategories(getVacancyCategories())
    }
    setDragState(null)
    setDragOverIndex(null)
  }

  const handleDropVacancy = (targetCategoryId: string, targetIndex: number) => {
    if (dragState?.type === "vacancy" && dragState.categoryId === targetCategoryId && dragState.index !== targetIndex) {
      reorderCategoryItems(targetCategoryId, dragState.index, targetIndex)
      setCategories(getVacancyCategories())
    }
    setDragState(null)
    setDragOverVacancy(null)
  }

  const handleDragEnd = () => {
    setDragState(null)
    setDragOverIndex(null)
    setDragOverVacancy(null)
  }

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
            <Briefcase className="size-5" />
          </div>
          <div className="overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-sidebar-foreground text-base tracking-tight">Команда</span>
            <p className="text-[11px] text-sidebar-foreground/50 tracking-wide truncate">Найм лучших, создание команды</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2 space-y-0">
        <SidebarGroup className="py-0 mb-0">
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] font-medium uppercase tracking-widest px-3 mb-1">
            Меню
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-1">
            <SidebarMenu className="gap-0.5">
              {mainNavItems.slice(0, 1).map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-xs"
                  >
                    <Link href={item.href}>
                      <item.icon className="size-4" />
                      <span className="text-sm">{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Найм Section */}
        <SidebarGroup className="py-0 mb-0">
          <Collapsible defaultOpen>
            <SidebarMenuItem className="list-none">
              <div className="flex items-center gap-0.5">
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 group/trigger text-sm flex-1">
                    <UserPlus className="size-4" />
                    <span className="flex-1 font-medium">Найм</span>
                    <Badge className="bg-sidebar-primary/20 text-sidebar-primary text-[12.5px] px-1.5 h-4">
                      {categories.reduce((acc, c) => acc + c.candidates, 0)}
                    </Badge>
                    <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180 text-sidebar-foreground/40" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  title="Создать вакансию"
                  onClick={() => setCreateVacancyOpen(true)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              <CollapsibleContent>
                <SidebarGroupContent className="mt-0.5">
                  <SidebarMenu className="gap-0.5">
                    {categories.map((category, index) => {
                      const IconComponent = getIconComponent(category.iconName)
                      return (
                        <Collapsible key={category.id} defaultOpen={index === 0}>
                          <SidebarMenuItem
                            draggable
                            onDragStart={() => handleDragStart("category", index)}
                            onDragOver={handleDragOver}
                            onDragEnter={() => handleDragEnterCategory(index)}
                            onDragEnd={handleDragEnd}
                            onDrop={() => handleDropCategory(index)}
                            className={cn(
                              "group/item transition-all",
                              dragState?.type === "category" && dragState.index === index && "opacity-40",
                              dragState?.type === "category" && dragOverIndex === index && dragState.index !== index && "ring-1 ring-primary/50 rounded-lg bg-sidebar-accent/30"
                            )}
                          >
                            <div className="flex items-center gap-1 mb-0">
                              <GripVertical className="size-3.5 text-sidebar-foreground/30 opacity-0 group-hover/item:opacity-100 transition-opacity cursor-move flex-shrink-0" />
                              <CollapsibleTrigger asChild>
                                <SidebarMenuButton className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 flex-1 group/trigger text-xs">
                                  <IconComponent className="size-4" />
                                  <span className="flex-1">{category.name}</span>
                                  <div className="flex items-center gap-1">
                                    <Badge 
                                      variant="outline" 
                                      className="border-sidebar-border/50 text-sidebar-foreground/50 text-[10px] px-1 h-4 min-w-5 justify-center"
                                    >
                                      {category.vacancies}
                                    </Badge>
                                    <Badge 
                                      className="bg-sidebar-primary/20 text-sidebar-primary text-[10px] px-1 h-4 min-w-6 justify-center"
                                    >
                                      {category.candidates}
                                    </Badge>
                                    <ChevronDown className="size-3 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180 text-sidebar-foreground/40" />
                                  </div>
                                </SidebarMenuButton>
                              </CollapsibleTrigger>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-6 opacity-0 group-hover/item:opacity-100 transition-opacity shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                                onClick={() => handleOpenEdit(category.id, category.name, category.iconName)}
                              >
                                <Edit2 className="size-3" />
                              </Button>
                            </div>
                            <CollapsibleContent>
                              <SidebarMenuSub className="gap-0.5 mt-0.5">
                                {category.items.map((item, itemIndex) => (
                                  <SidebarMenuSubItem 
                                    key={item.id}
                                    draggable
                                    onDragStart={() => handleDragStart("vacancy", itemIndex, category.id)}
                                    onDragOver={handleDragOver}
                                    onDragEnter={() => handleDragEnterVacancy(category.id, itemIndex)}
                                    onDragEnd={handleDragEnd}
                                    onDrop={() => handleDropVacancy(category.id, itemIndex)}
                                    className={cn(
                                      "group/subitem transition-all",
                                      dragState?.type === "vacancy" && dragState.categoryId === category.id && dragState.index === itemIndex && "opacity-40",
                                      dragState?.type === "vacancy" && dragOverVacancy?.categoryId === category.id && dragOverVacancy?.index === itemIndex && dragState.index !== itemIndex && "ring-1 ring-primary/50 rounded-md bg-sidebar-accent/30"
                                    )}
                                  >
                                    <div className="flex items-center gap-1.5 w-full">
                                      <GripVertical className="size-3 text-sidebar-foreground/25 opacity-0 group-hover/subitem:opacity-100 transition-opacity cursor-move flex-shrink-0" />
                                      <SidebarMenuSubButton 
                                        isActive={index === 0 && item.id === "1"}
                                        className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground h-7 text-xs flex-1"
                                      >
                                        <span className="truncate">{item.name}</span>
                                        <Badge 
                                          variant="secondary" 
                                          className="ml-auto bg-sidebar-accent/40 text-sidebar-accent-foreground/70 text-[10px] px-1 h-4"
                                        >
                                          {item.candidates}
                                        </Badge>
                                      </SidebarMenuSubButton>
                                    </div>
                                  </SidebarMenuSubItem>
                                ))}
                              </SidebarMenuSub>
                            </CollapsibleContent>
                          </SidebarMenuItem>
                        </Collapsible>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarGroup>

        {/* Ввод в должность Section */}
        <SidebarGroup className="py-0 mb-0">
          <Collapsible>
            <SidebarMenuItem className="list-none">
              <CollapsibleTrigger asChild>
                <SidebarMenuButton className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 group/trigger text-sm">
                  <UserCheck className="size-4" />
                  <span className="flex-1 font-medium">Ввод в должность</span>
                  <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[12.5px] px-1.5 h-4">
                    {onboardingItems.reduce((acc, i) => acc + i.count, 0)}
                  </Badge>
                  <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180 text-sidebar-foreground/40" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub className="mt-0.5 gap-0.5">
                  {onboardingItems.map((item) => (
                    <SidebarMenuSubItem key={item.id}>
                      <SidebarMenuSubButton className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-7 text-xs">
                        <span className="truncate">{item.name}</span>
                        <Badge 
                          variant="secondary" 
                          className="ml-auto bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] px-1 h-4"
                        >
                          {item.count}
                        </Badge>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarGroup>

        {/* Обучение Section */}
        <SidebarGroup className="py-0 mb-0">
          <Collapsible>
            <SidebarMenuItem className="list-none">
              <CollapsibleTrigger asChild>
                <SidebarMenuButton className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 group/trigger text-sm">
                  <GraduationCap className="size-4" />
                  <span className="flex-1 font-medium">Обучение</span>
                  <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 text-[12.5px] px-1.5 h-4">
                    {trainingItems.reduce((acc, i) => acc + i.count, 0)}
                  </Badge>
                  <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180 text-sidebar-foreground/40" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub className="mt-0.5 gap-0.5">
                  {trainingItems.map((item) => (
                    <SidebarMenuSubItem key={item.id}>
                      <SidebarMenuSubButton className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-7 text-xs">
                        <span className="truncate">{item.name}</span>
                        <Badge 
                          variant="secondary" 
                          className="ml-auto bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] px-1 h-4"
                        >
                          {item.count}
                        </Badge>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup className="py-0 mb-0">
          <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] font-medium uppercase tracking-widest px-3 mb-1">
            Инструменты
          </SidebarGroupLabel>
          <SidebarGroupContent className="mt-1">
            <SidebarMenu className="gap-0.5">
              {mainNavItems.slice(1).map((item) => (
                <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href && item.href !== "/"}
                    className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 text-xs"
                  >
                    <Link href={item.href}>
                      <item.icon className="size-4" />
                      <span className="text-sm">{item.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="mb-3 px-1 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-sidebar-foreground/50">Активных вакансий</span>
            <span className="text-sidebar-foreground/70 font-medium">16 / 20</span>
          </div>
          <Progress value={80} className="h-1.5 bg-sidebar-accent" />
          <p className="text-[10px] text-sidebar-foreground/40 mt-1">Использовано 80% лимита</p>
        </div>
        
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-accent transition-colors cursor-pointer group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1">
          <Avatar className="size-8 shrink-0">
            <AvatarImage src="/placeholder.svg" />
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-medium">
              АИ
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-[13px] font-medium text-sidebar-foreground truncate">
              Анна Иванова
            </p>
            <p className="text-[11px] text-sidebar-foreground/50 truncate">
              HR Менеджер
            </p>
          </div>
        </div>
      </SidebarFooter>

      <Dialog open={!!editingCategory} onOpenChange={() => setEditingCategory(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Редактировать категорию</DialogTitle>
          </DialogHeader>
          {editingCategory && (
            <div className="space-y-5">
              {/* Name input */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Название</label>
                <Input
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  placeholder="Название категории"
                  className="h-9"
                  autoFocus
                />
              </div>

              {/* Icon picker */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Иконка</label>
                <div className="grid grid-cols-7 gap-1.5 p-3 bg-muted/50 rounded-lg border border-border">
                  {Object.entries(iconMap).map(([name, Icon]) => (
                    <button
                      key={name}
                      type="button"
                      title={name}
                      onClick={() => setEditingCategory({ ...editingCategory, iconName: name })}
                      className={cn(
                        "flex items-center justify-center w-9 h-9 rounded-md transition-all",
                        editingCategory.iconName === name
                          ? "bg-primary text-primary-foreground shadow-sm scale-105"
                          : "text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm"
                      )}
                    >
                      <Icon className="size-4" />
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Выбрано: <span className="font-medium text-foreground">{editingCategory.iconName}</span>
                </p>
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" onClick={() => setEditingCategory(null)}>
                  Отмена
                </Button>
                <Button onClick={handleSaveEdit}>
                  Сохранить
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <CreateVacancyDialog open={createVacancyOpen} onOpenChange={setCreateVacancyOpen} />
      <SidebarRail />
    </Sidebar>
  )
}
