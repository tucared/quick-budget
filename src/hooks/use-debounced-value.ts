import { useEffect, useState } from "react"

/**
 * Debounces a value by delaying its update until after a specified delay period
 * has passed without the value changing.
 *
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds (default: 300ms)
 * @returns The debounced value
 *
 * @example
 * const [searchTerm, setSearchTerm] = useState("")
 * const debouncedSearchTerm = useDebouncedValue(searchTerm, 500)
 *
 * useEffect(() => {
 *   // This only runs 500ms after the user stops typing
 *   performSearch(debouncedSearchTerm)
 * }, [debouncedSearchTerm])
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    // Set up a timer to update the debounced value after the delay
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Clean up the timer if value changes before delay expires
    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
