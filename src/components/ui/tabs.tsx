"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import type * as React from "react"

import { cn } from "@/lib/utils"

// Tab dokumen (notebook hmx, RU-23): garis bawah biru pada tab aktif.
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("space-y-4", className)} {...props} />
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("relative flex gap-1 overflow-x-auto border-b", className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-control font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-selected:border-primary data-selected:text-primary",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  )
}

export function TabCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-1.5 text-caption text-muted-foreground">
      {children}
    </span>
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
