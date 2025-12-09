"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Globe2, TrendingUp, GitCompare, Table2, Moon, Sun, Bot } from "lucide-react"
import { Button } from "@/components/shadcn/button"
import { SidebarTrigger } from "@/components/shadcn/sidebar"
import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"
import { useEffect, useState, startTransition } from "react"

const navigationItems = [
  {
    label: "World Map",
    href: "/world-map",
    icon: Globe2,
  },
  {
    label: "Single Country",
    href: "/single-country",
    icon: TrendingUp,
  },
  {
    label: "Compare Countries",
    href: "/country-comparison",
    icon: GitCompare,
  },
  {
    label: "Tabular view",
    href: "/tabular-view",
    icon: Table2,
  },
  {
    label: "AI Assistant",
    href: "/ai-assistant",
    icon: Bot,
  },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    startTransition(() => {
      setMounted(true)
    })
  }, [])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        disabled
        className="size-9"
      >
        <div className="size-4" />
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      className="size-9"
    >
      {theme === "dark" ? (
        <Sun className="size-4" />
      ) : (
        <Moon className="size-4" />
      )}
    </Button>
  )
}

export function Navbar() {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-center w-full">
        <div className="flex items-center gap-2">
          {/* Sidebar trigger */}
          <SidebarTrigger />
          
          {/* Home button */}
          <Link href="/">
            <Button
              variant={pathname === "/" ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-9",
                pathname === "/" && "bg-accent"
              )}
            >
              <Home className="mr-2 size-4" />
              Home
            </Button>
          </Link>

          {/* Navigation items */}
          <div className="flex items-center gap-1">
            {navigationItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive ? "secondary" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-9",
                      isActive && "bg-accent"
                    )}
                  >
                    <Icon className="mr-2 size-4" />
                    {item.label}
                  </Button>
                </Link>
              )
            })}
          </div>

          {/* Theme toggle */}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}

