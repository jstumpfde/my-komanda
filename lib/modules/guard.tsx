import type { ModuleId } from './types'

interface ModuleGuardProps {
  moduleId: ModuleId
  children: React.ReactNode
}

export function ModuleGuard({ moduleId, children }: ModuleGuardProps) {
  const isActive = true
  if (!isActive) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-muted-foreground">
        <div className="text-4xl">🔒</div>
        <p className="text-lg font-medium">Модуль не подключён</p>
      </div>
    )
  }
  return <>{children}</>
}
