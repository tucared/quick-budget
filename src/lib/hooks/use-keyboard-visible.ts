"use client"

import { useState, useEffect } from "react"

/**
 * Detects whether the mobile virtual keyboard is open
 * by comparing visualViewport height to window innerHeight.
 */
export function useKeyboardVisible() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const THRESHOLD = 0.75 // keyboard is "open" when viewport < 75% of window height

    const handleResize = () => {
      setIsKeyboardVisible(viewport.height < window.innerHeight * THRESHOLD)
    }

    viewport.addEventListener("resize", handleResize)
    return () => viewport.removeEventListener("resize", handleResize)
  }, [])

  return isKeyboardVisible
}
