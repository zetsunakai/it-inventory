"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { Children } from "react"
import type * as React from "react"

import { cn } from "@/lib/utils"

// Tab dokumen: pilihan aktif memakai data-active milik Base UI. equalWidth membagi tab
// dokumen BC rata: 2/3 kolom di HP/tablet, satu baris di desktop. Label boleh membungkus
// tanpa dipotong atau membuat halaman scroll horizontal.
function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root data-slot="tabs" className={cn("form-notebook", className)} {...props} />
  )
}

function TabsList({
  className,
  equalWidth = false,
  children,
  style,
  ...props
}: TabsPrimitive.List.Props & { equalWidth?: boolean }) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative min-h-12 border-b",
        equalWidth
          ? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(var(--tabs-count),minmax(0,1fr))]"
          : "flex flex-wrap px-2",
        className,
      )}
      style={
        equalWidth
          ? (state) =>
              ({
                "--tabs-count": Math.max(1, Children.count(children)),
                ...(typeof style === "function" ? style(state) : style),
              }) as React.CSSProperties & { "--tabs-count": number }
          : style
      }
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  )
}

function TabsTrigger({ className, children, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "-mb-px flex min-h-12 min-w-0 shrink-0 items-center justify-center gap-2 border-b-2 border-transparent px-3 py-2 text-center text-control leading-5 font-medium whitespace-normal text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-active:border-primary data-active:bg-info-soft data-active:font-semibold data-active:text-primary",
        className,
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.Tab>
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("min-h-50 px-6 pt-6 pb-8 outline-none", className)}
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
