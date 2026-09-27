"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, Cpu } from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * Picks which generation model answers the next question.
 *
 * The list comes from the LLM server's own `/models`, so it is whatever is
 * actually loaded rather than a hardcoded menu. Switching applies to the next
 * message — an answer already streaming keeps the model it started with.
 */
export function ModelPicker({
  models,
  value,
  defaultModel,
  onChange,
}: {
  models: string[]
  value: string
  defaultModel: string
  onChange: (model: string) => void
}) {
  // Controlled so a choice dismisses the popover. Left open, Radix's dismiss
  // layer would absorb the next click anywhere on the page -- which reads as a
  // dead Send button rather than as a popover closing.
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`Model: ${value}`}
        className="flex max-w-[11rem] items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:max-w-[16rem]"
      >
        <Cpu className="size-3.5 shrink-0" />
        <span className="truncate">{value}</span>
        <ChevronsUpDown className="size-3 shrink-0 opacity-60" />
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 gap-1 p-1.5">
        <p className="px-1.5 py-1 text-[11px] text-muted-foreground">
          Answers the next message
        </p>
        <div className="max-h-64 overflow-y-auto scrollbar-slim">
          {models.map((model) => (
            <button
              key={model}
              type="button"
              onClick={() => {
                onChange(model)
                setOpen(false)
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs transition hover:bg-muted",
                model === value ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Check className={cn("size-3.5 shrink-0", model === value ? "" : "opacity-0")} />
              <span className="truncate">{model}</span>
              {model === defaultModel && (
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">default</span>
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
