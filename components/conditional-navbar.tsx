"use client"

import { usePathname } from "next/navigation"
import { Navbar } from "./navbar"

export function ConditionalNavbar() {
  const pathname = usePathname()
  
  // Don't show navbar on home page
  if (pathname === "/") {
    return null
  }

  return <Navbar />
}

