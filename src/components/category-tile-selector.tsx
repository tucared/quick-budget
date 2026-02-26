"use client"

import * as React from "react"
import { Check, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Category } from "@/lib/types"

export interface GroupedOption {
  value: string
  label: string
  icon?: string
  group: string
  frequency?: number // Higher = more recently/frequently used
}
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

interface CategoryTileSelectorProps {
  categories: Category[]
  topCategoryIds: string[]
  value?: string
  onValueChange: (value: string) => void
  allOptions: GroupedOption[]
}

export function CategoryTileSelector({
  categories,
  topCategoryIds,
  value,
  onValueChange,
  allOptions,
}: CategoryTileSelectorProps) {
  const [otherOpen, setOtherOpen] = React.useState(false)

  // Get up to 5 tile categories from the ranked list
  const tileCategories = React.useMemo(() => {
    return topCategoryIds
      .slice(0, 5)
      .map((id) => categories.find((c) => c.id === id))
      .filter((c): c is Category => c != null)
  }, [topCategoryIds, categories])

  // Group options for the "Other" dialog (same logic as GroupedCombobox)
  const groupedOptions = React.useMemo(() => {
    const groups: Record<string, GroupedOption[]> = {}
    allOptions.forEach((option) => {
      if (!groups[option.group]) groups[option.group] = []
      groups[option.group].push(option)
    })
    Object.keys(groups).forEach((key) => {
      groups[key].sort((a, b) => {
        const freqDiff = (b.frequency || 0) - (a.frequency || 0)
        return freqDiff !== 0 ? freqDiff : a.label.localeCompare(b.label)
      })
    })
    return groups
  }, [allOptions])

  const tileCategoryIds = tileCategories.map((c) => c.id)
  const isSelectedInTiles = tileCategoryIds.includes(value || "")
  const selectedCategory = value ? categories.find((c) => c.id === value) : null

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5">
        {tileCategories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onValueChange(category.id)}
            className={cn(
              "flex flex-col items-center justify-center rounded-lg border px-1 py-2 text-center transition-colors min-h-[3.25rem]",
              value === category.id
                ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {category.icon && (
              <span className="text-base leading-none">{category.icon}</span>
            )}
            <span className="mt-0.5 text-[11px] font-medium leading-tight truncate w-full px-0.5">
              {category.name}
            </span>
          </button>
        ))}

        {/* "Other" tile - shows selected non-tile category or generic "Other" */}
        <button
          type="button"
          onClick={() => setOtherOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center rounded-lg border px-1 py-2 text-center transition-colors min-h-[3.25rem]",
            !isSelectedInTiles && value
              ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
              : "border-dashed border-input bg-background hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {!isSelectedInTiles && selectedCategory ? (
            <>
              {selectedCategory.icon && (
                <span className="text-base leading-none">{selectedCategory.icon}</span>
              )}
              <span className="mt-0.5 text-[11px] font-medium leading-tight truncate w-full px-0.5">
                {selectedCategory.name}
              </span>
            </>
          ) : (
            <>
              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              <span className="mt-0.5 text-[11px] font-medium leading-tight text-muted-foreground">
                Other
              </span>
            </>
          )}
        </button>
      </div>

      {/* Full category search dialog */}
      <Dialog open={otherOpen} onOpenChange={setOtherOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogTitle className="sr-only">Select category</DialogTitle>
          <Command>
            <CommandInput placeholder="Search categories..." />
            <CommandList className="max-h-64">
              <CommandEmpty>No category found.</CommandEmpty>
              {Object.entries(groupedOptions).map(([group, options]) => (
                <CommandGroup key={group} heading={group}>
                  {options.map((option) => (
                    <CommandItem
                      key={option.value}
                      value={option.value}
                      keywords={[option.label]}
                      onSelect={() => {
                        onValueChange(option.value)
                        setOtherOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
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
        </DialogContent>
      </Dialog>
    </>
  )
}
