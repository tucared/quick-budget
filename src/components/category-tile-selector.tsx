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
      .slice(0, 7)
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
      <div className="grid grid-cols-4 gap-1.5">
        {tileCategories.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onValueChange(category.id)}
            title={category.name}
            className={cn(
              "flex items-center justify-center rounded-lg border py-2.5 text-center transition-colors",
              value === category.id
                ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
                : "border-input bg-background hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <span className="text-lg leading-none">{category.icon || "·"}</span>
          </button>
        ))}

        {/* "Other" tile - shows selected non-tile category or generic "..." */}
        <button
          type="button"
          onClick={() => setOtherOpen(true)}
          title={!isSelectedInTiles && selectedCategory ? selectedCategory.name : "Other"}
          className={cn(
            "flex items-center justify-center rounded-lg border py-2.5 text-center transition-colors",
            !isSelectedInTiles && value
              ? "border-primary bg-primary/10 text-primary ring-1 ring-primary"
              : "border-dashed border-input bg-background hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {!isSelectedInTiles && selectedCategory ? (
            <span className="text-lg leading-none">{selectedCategory.icon || "·"}</span>
          ) : (
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
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
