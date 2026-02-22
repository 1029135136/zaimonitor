"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [setMounted])

  if (!mounted || !resolvedTheme) {
    return (
      <button
        className="paper-panel rounded-lg p-2.5 transition hover:bg-[color:var(--accent)]/40"
        aria-label="Toggle theme"
        disabled
      >
        <div className="h-4 w-4" />
      </button>
    )
  }

  const currentTheme = resolvedTheme === "dark" ? "dark" : "light"

  return (
    <button
      onClick={() => setTheme(currentTheme === "dark" ? "light" : "dark")}
      className="paper-panel rounded-lg p-2.5 transition hover:bg-[color:var(--accent)]/40"
      aria-label="Toggle theme"
    >
      {currentTheme === "dark" ? (
        <Sun className="h-4 w-4 text-[color:var(--card-foreground)]" />
      ) : (
        <Moon className="h-4 w-4 text-[color:var(--card-foreground)]" />
      )}
    </button>
  )
}
