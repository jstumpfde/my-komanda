"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  CheckCircle2, Calendar, Phone, Video, Building2, Save,
  Sparkles, Clock, Play,
} from "lucide-react"

type PostDemoMode = "auto" | "manual"

export function PostDemoSettings() {
  const [mode, setMode] = useState<PostDemoMode>("auto")

  // Auto mode
  const [threshold, setThreshold] = useState(85)
  const [aboveTitle, setAboveTitle] = useState("Отлично! Выберите удобное время для встречи")
  const [meetPhone, setMeetPhone] = useState(true)
  const [meetOnline, setMeetOnline] = useState(true)
  const [meetOffice, setMeetOffice] = useState(false)
  const [officeAddress, setOfficeAddress] = useState("")
  const [belowTitle, setBelowTitle] = useState("Спасибо за прохождение!")
  const [belowText, setBelowText] = useState("Мы рассмотрим вашу анкету и свяжемся с вами в ближайшее время")

  // Manual mode
  const [manualTitle, setManualTitle] = useState("Отлично, [Имя]! Вы прошли демонстрацию 🎉")
  const [manualText, setManualText] = useState("Мы изучим ваши ответы и свяжемся с вами в ближайшее время")
  const [manualButton, setManualButton] = useState("Хорошо, жду!")

  // Preview score for demo
  const [previewScore, setPreviewScore] = useState(88)

  const isAbove = previewScore >= threshold

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Play className="w-4 h-4" />
            После демонстрации
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Mode selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Режим</Label>
            <div className="space-y-2">
              {([
                { value: "auto" as const, label: "Автоматический", desc: "Кандидат сам записывается на интервью по порогу AI-скоринга" },
                { value: "manual" as const, label: "Ручной", desc: "HR связывается сам после просмотра результатов" },
              ]).map(opt => (
                <button
                  key={opt.value}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                    mode === opt.value ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-border hover:border-primary/30"
                  )}
                  onClick={() => setMode(opt.value)}
                >
                  <div className={cn("w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center", mode === opt.value ? "border-primary" : "border-muted-foreground/40")}>
                    {mode === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Auto mode settings */}
          {mode === "auto" && (
            <div className="space-y-5">
              {/* Threshold */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    Порог AI-скоринга
                  </Label>
                  <span className="text-lg font-bold text-primary">{threshold}%</span>
                </div>
                <Slider
                  value={[threshold]}
                  onValueChange={([v]) => setThreshold(v)}
                  min={0} max={100} step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Кандидаты с баллом {">"}= {threshold}% смогут записаться на интервью автоматически
                </p>
              </div>

              <Separator />

              {/* Above threshold */}
              <div className="space-y-3 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Если балл {">"}= {threshold}%
                </p>
                <div className="space-y-2">
                  <Label className="text-xs">Заголовок</Label>
                  <Input value={aboveTitle} onChange={e => setAboveTitle(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Доступные типы встречи</Label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={meetPhone} onCheckedChange={v => setMeetPhone(!!v)} />
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm">Звонок (телефон)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={meetOnline} onCheckedChange={v => setMeetOnline(!!v)} />
                      <Video className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm">Онлайн (Zoom / Телемост)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox checked={meetOffice} onCheckedChange={v => setMeetOffice(!!v)} />
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-sm">Офис</span>
                    </label>
                    {meetOffice && (
                      <Input value={officeAddress} onChange={e => setOfficeAddress(e.target.value)} placeholder="Адрес офиса" className="h-8 text-sm ml-6 w-[calc(100%-24px)]" />
                    )}
                  </div>
                </div>
              </div>

              {/* Below threshold */}
              <div className="space-y-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Если балл {"<"} {threshold}%
                </p>
                <div className="space-y-2">
                  <Label className="text-xs">Заголовок</Label>
                  <Input value={belowTitle} onChange={e => setBelowTitle(e.target.value)} className="h-8 text-sm" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Текст</Label>
                  <textarea className="w-full border rounded-lg p-2 text-sm resize-none h-16 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" value={belowText} onChange={e => setBelowText(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* Manual mode settings */}
          {mode === "manual" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Заголовок</Label>
                <Input value={manualTitle} onChange={e => setManualTitle(e.target.value)} className="h-8 text-sm" />
                <p className="text-[10px] text-muted-foreground">[Имя] подставляется автоматически</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Текст</Label>
                <textarea className="w-full border rounded-lg p-2 text-sm resize-none h-16 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none" value={manualText} onChange={e => setManualText(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Текст кнопки</Label>
                <Input value={manualButton} onChange={e => setManualButton(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          )}

          <Button className="gap-1.5" onClick={() => toast.success("Настройки сохранены")}>
            <Save className="w-4 h-4" /> Сохранить настройки
          </Button>
        </CardContent>
      </Card>

      {/* Live preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Превью финального экрана</CardTitle>
          {mode === "auto" && (
            <div className="flex items-center gap-3 mt-2">
              <Label className="text-xs text-muted-foreground">Тестовый балл:</Label>
              <Slider value={[previewScore]} onValueChange={([v]) => setPreviewScore(v)} min={0} max={100} step={1} className="w-32" />
              <span className={cn("text-sm font-bold", previewScore >= threshold ? "text-emerald-600" : "text-amber-600")}>{previewScore}%</span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: "#f8fafc" }}>
            <div className="p-6 text-center space-y-4 max-w-sm mx-auto">
              {mode === "auto" ? (
                isAbove ? (
                  <>
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                    <h3 className="text-lg font-bold text-gray-900">{aboveTitle}</h3>
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      AI-скоринг: <span className="font-bold text-emerald-600">{previewScore}%</span>
                    </div>
                    <div className="space-y-2 text-left">
                      <p className="text-xs text-gray-500">Выберите тип встречи:</p>
                      <div className="space-y-1.5">
                        {meetPhone && <div className="p-2 rounded-lg border text-sm flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> Звонок</div>}
                        {meetOnline && <div className="p-2 rounded-lg border text-sm flex items-center gap-2"><Video className="w-4 h-4 text-gray-400" /> Онлайн</div>}
                        {meetOffice && <div className="p-2 rounded-lg border text-sm flex items-center gap-2"><Building2 className="w-4 h-4 text-gray-400" /> Офис</div>}
                      </div>
                    </div>
                    <div className="h-9 rounded-lg bg-primary flex items-center justify-center text-white text-sm font-medium">
                      <Calendar className="w-4 h-4 mr-1.5" /> Выбрать время
                    </div>
                  </>
                ) : (
                  <>
                    <Clock className="w-12 h-12 text-amber-500 mx-auto" />
                    <h3 className="text-lg font-bold text-gray-900">{belowTitle}</h3>
                    <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      AI-скоринг: <span className="font-bold text-amber-600">{previewScore}%</span>
                      <span className="text-xs">(порог: {threshold}%)</span>
                    </div>
                    <p className="text-sm text-gray-500">{belowText}</p>
                  </>
                )
              ) : (
                <>
                  <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
                  <h3 className="text-lg font-bold text-gray-900">{manualTitle.replace("[Имя]", "Иван")}</h3>
                  <p className="text-sm text-gray-500">{manualText}</p>
                  <div className="h-9 rounded-lg bg-primary flex items-center justify-center text-white text-sm font-medium">
                    {manualButton}
                  </div>
                </>
              )}
              <p className="text-[10px] text-gray-300">Powered by Company24</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
