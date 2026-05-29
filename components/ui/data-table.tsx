"use client"

// Эталонный вид таблиц платформы. Композируемые примитивы заменяют сырые
// <table>/<thead>/<th>/<tr>/<td> и дают единый стиль: отступы ячеек, липкая
// шапка, ховер строк, скругление карточки без лишнего верхнего паддинга.
//
// Эталон взят из /hr/library. Новые таблицы делать на этих примитивах; старые
// (их по сайту ~83) приводить к ним по мере правок раздела.
//
// Пример:
//   <TableCard>
//     <DataTable>
//       <DataHead>
//         <DataHeadCell>Название</DataHeadCell>
//         <DataHeadCell align="center" width="80px">Кол-во</DataHeadCell>
//         <DataHeadCell align="right" width="80px">Действия</DataHeadCell>
//       </DataHead>
//       <tbody>
//         {rows.map((r) => (
//           <DataRow key={r.id}>
//             <DataCell>{r.name}</DataCell>
//             <DataCell align="center">{r.count}</DataCell>
//             <DataCell align="right">{actions}</DataCell>
//           </DataRow>
//         ))}
//       </tbody>
//     </DataTable>
//   </TableCard>

import * as React from "react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

type Align = "left" | "center" | "right"
const ALIGN: Record<Align, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}

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

// Шапка таблицы. Дети — это <DataHeadCell> (оборачиваются в <tr> автоматически).
export function DataHead({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <thead className={cn("bg-muted/50 border-b border-t border-border sticky top-0 z-10", className)}>
      <tr>{children}</tr>
    </thead>
  )
}

export function DataHeadCell({
  align = "left",
  width,
  className,
  children,
  ...props
}: React.ComponentProps<"th"> & { align?: Align; width?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground",
        ALIGN[align],
        className,
      )}
      style={width ? { width, ...props.style } : props.style}
      {...props}
    >
      {children}
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
