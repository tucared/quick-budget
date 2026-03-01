"use client"

import { useState, useEffect } from "react"

/**
 * Detects whether the mobile virtual keyboard is open by comparing
 * visualViewport height to window.innerHeight.
 * Also sets a --dvh CSS custom property on documentElement for use
 * in max-height calculations (iOS Safari ignores dvh when keyboard is open).
 */
export function useKeyboardVisible() {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    const update = () => {
      const ratio = viewport.height / window.innerHeight
      setIsKeyboardVisible(ratio < 0.75)
      // Set a CSS custom property that tracks the real visible height
      document.documentElement.style.setProperty(
        "--visible-vh",
        `${viewport.height}px`
      )
    }

    update()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)
    return () => {
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
      document.documentElement.style.removeProperty("--visible-vh")
    }
  }, [])

  return isKeyboardVisible
}
