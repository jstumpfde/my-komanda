"use client"

// Эталонный вид таблиц платформы. Композируемые примитивы заменяют сырые
// <table>/<thead>/<th>/<tr>/<td> и дают единый стиль: шапка, отступы ячеек,
// липкая шапка, ховер строк, скругление карточки без лишнего верхнего паддинга.
//
// ВАЖНО: компонент задаёт только ВИД. Действия в строке («⋮»), состав колонок,
// сортировка и выбор строк — у каждой таблицы свои; они опциональны и
// подключаются там, где нужны. Стиль не диктует функционал.
//
// Возможности (всё опционально):
//  • сортируемая шапка   — <DataHeadCell sortable sortDir={dir} onSort={...}>
//  • выбор строк         — <DataSelectHeadCell> + <DataSelectCell>
//  • выравнивание/ширина — align="left|center|right", width="120px"
//
// Пример:
//   <TableCard>
//     <DataTable>
//       <DataHead>
//         <DataSelectHeadCell checked={allSelected} indeterminate={someSelected} onCheckedChange={toggleAll} />
//         <DataHeadCell>Название</DataHeadCell>
//         <DataHeadCell sortable sortDir={sort === "date" ? dir : null} onSort={() => toggleSort("date")}>Создана</DataHeadCell>
//         <DataHeadCell align="right" width="80px">Действия</DataHeadCell>
//       </DataHead>
//       <tbody>
//         {rows.map((r) => (
//           <DataRow key={r.id}>
//             <DataSelectCell checked={sel.has(r.id)} onCheckedChange={() => toggleOne(r.id)} />
//             <DataCell>{r.name}</DataCell>
//             <DataCell className="text-muted-foreground">{r.date}</DataCell>
//             <DataCell align="right">{actions}</DataCell>
//           </DataRow>
//         ))}
//       </tbody>
//     </DataTable>
//   </TableCard>

import * as React from "react"
import { ListFilter } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"

type Align = "left" | "center" | "right"
const ALIGN: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}
export type SortDir = "asc" | "desc" | null

// Карточка-обёртка таблицы: убирает встроенный у Card py-6 (из-за него над
// шапкой висел пустой отступ) и обрезает таблицу по скруглению.
export function TableCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return <Card className={cn("py-0 overflow-hidden", className)} {...props} />
}

// Скролл-контейнер + сама таблица. Липкая шапка работает в паре с maxHeight.
export function DataTable({
  className,
  maxHeight = "60vh",
  containerClassName,
  children,
  ...props
}: React.ComponentProps<"table"> & { maxHeight?: string; containerClassName?: string }) {
  return (
    <div className={cn("overflow-auto", containerClassName)} style={{ maxHeight }}>
      <table className={cn("w-full", className)} {...props}>
        {children}
      </table>
    </div>
  )
}

// Шапка. Дети — <DataHeadCell> / <DataSelectHeadCell> (оборачиваются в <tr>).
export function DataHead({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <thead className={cn("bg-muted/50 border-b border-t border-border sticky top-0 z-10", className)}>
      <tr>{children}</tr>
    </thead>
  )
}

// Ячейка шапки. Стиль единый (без капса, полужирный, серый — как в вакансиях/
// кандидатах). При sortable превращается в кнопку с иконкой-воронкой.
export function DataHeadCell({
  align = "left",
  width,
  sortable,
  sortDir = null,
  onSort,
  className,
  children,
  ...props
}: React.ComponentProps<"th"> & { align?: Align; width?: string; sortable?: boolean; sortDir?: SortDir; onSort?: () => void }) {
  return (
    <th
      className={cn("px-4 py-3 text-sm font-semibold text-muted-foreground", ALIGN[align], className)}
      style={width ? { width, ...props.style } : props.style}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            "inline-flex items-center gap-1.5 select-none transition-colors",
            align === "right" && "flex-row-reverse",
            sortDir ? "text-foreground" : "hover:text-foreground",
          )}
        >
          <ListFilter className={cn("size-3.5 transition-transform", sortDir === "desc" && "scale-y-[-1]", !sortDir && "opacity-40")} />
          {children}
        </button>
      ) : (
        children
      )}
    </th>
  )
}

// Узкая ячейка-чекбокс в шапке (выбрать всё). indeterminate — частичный выбор.
export function DataSelectHeadCell({
  checked,
  indeterminate,
  onCheckedChange,
  className,
}: {
  checked?: boolean
  indeterminate?: boolean
  onCheckedChange?: (checked: boolean) => void
  className?: string
}) {
  return (
    <th className={cn("pl-5 pr-2 py-3 w-10", className)}>
      <Checkbox
        checked={indeterminate ? "indeterminate" : !!checked}
        onCheckedChange={(v) => onCheckedChange?.(v === true)}
      />
    </th>
  )
}

export function DataRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn("border-b border-border/50 hover:bg-muted/50 transition-colors", className)}
      {...props}
    />
  )
}

export function DataCell({
  align = "left",
  className,
  children,
  ...props
}: React.ComponentProps<"td"> & { align?: Align }) {
  return (
    <td className={cn("px-4 py-3 text-sm", ALIGN[align], className)} {...props}>
      {children}
    </td>
  )
}

// Узкая ячейка-чекбокс в строке. Клик не «проваливается» в onClick строки.
export function DataSelectCell({
  checked,
  onCheckedChange,
  className,
}: {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  className?: string
}) {
  return (
    <td className={cn("pl-5 pr-2 py-3 w-10", className)} onClick={(e) => e.stopPropagation()}>
      <Checkbox checked={!!checked} onCheckedChange={(v) => onCheckedChange?.(v === true)} />
    </td>
  )
}
