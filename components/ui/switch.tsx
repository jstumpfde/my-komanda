'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-border focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-muted-foreground/50 inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-border data-[state=unchecked]:border-border data-[state=checked]:border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={
          'bg-border data-[state=checked]:bg-background dark:data-[state=unchecked]:bg-muted-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-3.5 rounded-full ring-0 shadow-sm transition-transform data-[state=checked]:translate-x-[calc(100%-1px)] data-[state=unchecked]:translate-x-0.5'
        }
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
