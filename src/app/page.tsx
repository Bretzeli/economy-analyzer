"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Globe2, Map, TrendingUp, Table2, GitCompare } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/shadcn/card"
import { Button } from "@/components/shadcn/button"

const navigationCards = [
  {
    title: "World Map",
    description: "Explore economic data across the globe with an interactive world map visualization.",
    href: "/world-map",
    icon: Globe2,
    gradient: "from-blue-500 to-cyan-500",
  },
  {
    title: "Single Country",
    description: "Dive deep into detailed economic metrics and trends for a specific country.",
    href: "/single-country",
    icon: TrendingUp,
    gradient: "from-purple-500 to-pink-500",
  },
  {
    title: "Country Comparison",
    description: "Compare economic indicators side-by-side across multiple countries.",
    href: "/country-comparison",
    icon: GitCompare,
    gradient: "from-orange-500 to-red-500",
  },
  {
    title: "Tabular View",
    description: "Browse and filter economic data in a comprehensive table format.",
    href: "/tabular-view",
    icon: Table2,
    gradient: "from-green-500 to-emerald-500",
  },
]

export default function HomePage() {
  useEffect(() => {
    document.title = "Economy Analyzer"
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <main className="container mx-auto px-4 py-16">
        <div className="flex flex-col items-center justify-center space-y-8 mb-16">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-primary/10">
              <Map className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Economy Analyzer
            </h1>
          </div>
          
          <p className="text-xl text-muted-foreground text-center max-w-2xl">
            Analyze and compare inflation and income data across countries and years.
            Discover insights through interactive visualizations and detailed reports.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2 max-w-5xl mx-auto">
          {navigationCards.map((card) => {
            const Icon = card.icon
            return (
              <Link key={card.href} href={card.href} className="group">
                <Card className="h-full transition-all duration-300 hover:shadow-lg hover:scale-[1.02] hover:border-primary/50">
                  <CardHeader>
                    <div className="flex items-center gap-4 mb-2">
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${card.gradient} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className="h-6 w-6 text-white" />
                      </div>
                      <CardTitle className="text-2xl group-hover:text-primary transition-colors">
                        {card.title}
                      </CardTitle>
                    </div>
                    <CardDescription className="text-base">
                      {card.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button 
                      variant="outline" 
                      className="w-full transition-colors group-hover:!bg-primary group-hover:!text-primary-foreground group-hover:!border-primary group-hover:hover:!bg-primary/90 group-hover:hover:!text-primary-foreground hover:text-primary-foreground hover:bg-primary/90"
                    >
                      Explore
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="ml-2 group-hover:translate-x-1 transition-transform"
                      >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            Web Intelligence WS25/26 <br />
            Florian Wetzel
          </p>
        </div>
      </main>
    </div>
  )
}

