"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export interface GroupedOption {
  value: string
  label: string
  icon?: string
  group: string
  frequency?: number // Higher = more recently/frequently used
}

interface GroupedComboboxProps {
  options: GroupedOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
}

export function GroupedCombobox({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  searchPlaceholder = "Search...",
  emptyMessage = "No option found.",
  className,
}: GroupedComboboxProps) {
  const [open, setOpen] = React.useState(false)

  // Group and sort options
  const groupedOptions = React.useMemo(() => {
    const groups: Record<string, GroupedOption[]> = {}

    options.forEach((option) => {
      if (!groups[option.group]) {
        groups[option.group] = []
      }
      groups[option.group].push(option)
    })

    // Sort within each group by frequency (descending)
    Object.keys(groups).forEach((groupKey) => {
      groups[groupKey].sort((a, b) => {
        const freqA = a.frequency || 0
        const freqB = b.frequency || 0
        if (freqA === freqB) {
          return a.label.localeCompare(b.label)
        }
        return freqB - freqA
      })
    })

    return groups
  }, [options])

  const selectedOption = options.find((option) => option.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          {selectedOption ? (
            <span className="flex items-center">
              {selectedOption.icon && (
                <span className="mr-2">{selectedOption.icon}</span>
              )}
              {selectedOption.label}
            </span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {Object.keys(groupedOptions).map((groupKey) => (
              <CommandGroup key={groupKey} heading={groupKey}>
                {groupedOptions[groupKey].map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label]}
                    onSelect={() => {
                      onValueChange(option.value)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === option.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {option.icon && <span className="mr-2">{option.icon}</span>}
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
