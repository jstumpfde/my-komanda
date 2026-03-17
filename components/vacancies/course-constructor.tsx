"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  Building2,
  Video,
  Package,
  DollarSign,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Save,
  Eye,
  Pencil,
  Presentation,
} from "lucide-react"
import { toast } from "sonner"

interface SlideData {
  companyName: string
  companyDescription: string
  logoUrl: string
  videoUrl: string
  productDescription: string
  baseSalary: string
  bonusPercent: string
  incomeExamples: string
  officeAddress: string
  workConditions: string
}

const emptySlides: SlideData = {
  companyName: "",
  companyDescription: "",
  logoUrl: "",
  videoUrl: "",
  productDescription: "",
  baseSalary: "",
  bonusPercent: "",
  incomeExamples: "",
  officeAddress: "",
  workConditions: "",
}

const SLIDES = [
  { id: 1, title: "О компании", icon: Building2, color: "#3b82f6" },
  { id: 2, title: "Видео от директора", icon: Video, color: "#8b5cf6" },
  { id: 3, title: "Продукт / Услуга", icon: Package, color: "#f59e0b" },
  { id: 4, title: "Твой доход", icon: DollarSign, color: "#22c55e" },
  { id: 5, title: "Условия работы", icon: MapPin, color: "#ec4899" },
]

interface CourseConstructorProps {
  onClose: () => void
}

export function CourseConstructor({ onClose }: CourseConstructorProps) {
  const [currentSlide, setCurrentSlide] = useState(1)
  const [data, setData] = useState<SlideData>(emptySlides)
  const [mode, setMode] = useState<"edit" | "preview">("edit")

  const update = (field: keyof SlideData, value: string) => {
    setData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = () => {
    toast.success("Демонстрация должности сохранена")
    onClose()
  }

  const slide = SLIDES[currentSlide - 1]

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Presentation className="w-5 h-5" />
            Конструктор демонстрации должности
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Создайте презентацию для кандидатов — {SLIDES.length} слайдов
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
            className="gap-1.5"
          >
            {mode === "edit" ? <Eye className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
            {mode === "edit" ? "Превью" : "Редактировать"}
          </Button>
          <Button size="sm" onClick={handleSave} className="gap-1.5">
            <Save className="w-3.5 h-3.5" />
            Сохранить
          </Button>
        </div>
      </div>

      {/* Slide navigation */}
      <div className="flex gap-2">
        {SLIDES.map((s) => (
          <button
            key={s.id}
            onClick={() => setCurrentSlide(s.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all flex-1",
              currentSlide === s.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <s.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{s.title}</span>
            <span className="sm:hidden">{s.id}</span>
          </button>
        ))}
      </div>

      {/* Slide content */}
      <Card>
        <CardContent className="p-5">
          {mode === "preview" ? (
            /* Preview mode */
            <div className="min-h-[300px]">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: slide.color }}>
                  <slide.icon className="w-4 h-4" />
                </div>
                <h4 className="text-base font-semibold text-foreground">Слайд {currentSlide}: {slide.title}</h4>
              </div>

              {currentSlide === 1 && (
                <div className="space-y-3">
                  <h3 className="text-xl font-bold">{data.companyName || "Название компании"}</h3>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.companyDescription || "Описание компании не заполнено"}</p>
                </div>
              )}
              {currentSlide === 2 && (
                <div className="space-y-3">
                  {data.videoUrl ? (
                    <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                      <div className="text-center">
                        <Video className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Видео: {data.videoUrl}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                      <p className="text-sm text-muted-foreground">Ссылка на видео не указана</p>
                    </div>
                  )}
                </div>
              )}
              {currentSlide === 3 && (
                <div className="space-y-3">
                  <p className="text-sm whitespace-pre-wrap">{data.productDescription || "Описание продукта не заполнено"}</p>
                </div>
              )}
              {currentSlide === 4 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground mb-1">Оклад</p>
                      <p className="text-xl font-bold text-foreground">{data.baseSalary || "—"} ₽</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground mb-1">Бонус</p>
                      <p className="text-xl font-bold text-foreground">{data.bonusPercent || "—"}%</p>
                    </div>
                  </div>
                  {data.incomeExamples && (
                    <div className="p-4 bg-success/5 border border-success/20 rounded-lg">
                      <p className="text-xs font-medium text-success mb-1">Примеры расчёта</p>
                      <p className="text-sm whitespace-pre-wrap">{data.incomeExamples}</p>
                    </div>
                  )}
                </div>
              )}
              {currentSlide === 5 && (
                <div className="space-y-3">
                  {data.officeAddress && (
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <p className="text-sm">{data.officeAddress}</p>
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{data.workConditions || "Условия не заполнены"}</p>
                </div>
              )}
            </div>
          ) : (
            /* Edit mode */
            <div className="min-h-[300px] space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge style={{ backgroundColor: slide.color }} className="text-white text-xs">
                  Слайд {currentSlide}
                </Badge>
                <span className="text-sm font-medium">{slide.title}</span>
              </div>

              {currentSlide === 1 && (
                <>
                  <div className="grid gap-1.5">
                    <Label>Название компании</Label>
                    <Input value={data.companyName} onChange={(e) => update("companyName", e.target.value)} placeholder="ООО «Компания»" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Описание компании</Label>
                    <Textarea value={data.companyDescription} onChange={(e) => update("companyDescription", e.target.value)} placeholder="Чем занимается, сколько лет на рынке, команда..." rows={4} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Ссылка на логотип</Label>
                    <Input value={data.logoUrl} onChange={(e) => update("logoUrl", e.target.value)} placeholder="https://..." />
                  </div>
                </>
              )}
              {currentSlide === 2 && (
                <div className="grid gap-1.5">
                  <Label>Ссылка на видео (YouTube / RuTube / VK)</Label>
                  <Input value={data.videoUrl} onChange={(e) => update("videoUrl", e.target.value)} placeholder="https://youtube.com/watch?v=..." />
                  <p className="text-[11px] text-muted-foreground">Видеообращение директора или команды к кандидатам</p>
                </div>
              )}
              {currentSlide === 3 && (
                <div className="grid gap-1.5">
                  <Label>Описание продукта / услуги</Label>
                  <Textarea value={data.productDescription} onChange={(e) => update("productDescription", e.target.value)} placeholder="Что за продукт, чем полезен, кто клиенты..." rows={6} />
                </div>
              )}
              {currentSlide === 4 && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <Label>Оклад (₽)</Label>
                      <Input value={data.baseSalary} onChange={(e) => update("baseSalary", e.target.value)} placeholder="80 000" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Бонус (%)</Label>
                      <Input value={data.bonusPercent} onChange={(e) => update("bonusPercent", e.target.value)} placeholder="15" />
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Примеры расчёта дохода</Label>
                    <Textarea value={data.incomeExamples} onChange={(e) => update("incomeExamples", e.target.value)} placeholder="Новичок: 80к + 15% = ~95к&#10;Средний: 80к + 40% = ~112к&#10;Топ: 80к + 80% = ~144к" rows={4} />
                  </div>
                </>
              )}
              {currentSlide === 5 && (
                <>
                  <div className="grid gap-1.5">
                    <Label>Адрес офиса</Label>
                    <Input value={data.officeAddress} onChange={(e) => update("officeAddress", e.target.value)} placeholder="Москва, ул. Примерная, д. 1" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Условия работы</Label>
                    <Textarea value={data.workConditions} onChange={(e) => update("workConditions", e.target.value)} placeholder="График, транспорт, парковка, столовая, ДМС..." rows={4} />
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentSlide(Math.max(1, currentSlide - 1))}
          disabled={currentSlide === 1}
          className="gap-1.5"
        >
          <ChevronLeft className="w-4 h-4" />
          Назад
        </Button>
        <span className="text-xs text-muted-foreground">
          Слайд {currentSlide} из {SLIDES.length}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentSlide(Math.min(SLIDES.length, currentSlide + 1))}
          disabled={currentSlide === SLIDES.length}
          className="gap-1.5"
        >
          Далее
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}
