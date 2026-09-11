'use client'

import { AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { CATEGORIES } from '@/lib/categories'

export function CategoryToggles({
  value,
  onChange,
  disabled = false,
}: {
  value: Record<string, boolean>
  onChange: (next: Record<string, boolean>) => void
  disabled?: boolean
}) {
  function toggle(key: string) {
    if (disabled) return
    onChange({ ...value, [key]: !value[key] })
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {CATEGORIES.map((c) => {
        const on = !!value[c.key]
        return (
          <div
            key={c.key}
            className={clsx(
              'rounded-lg border p-3 transition-colors',
              on ? 'border-astblue-300 bg-astblue-50/60' : 'border-gray-200 bg-white',
              !disabled && 'cursor-pointer hover:border-astblue-400'
            )}
            onClick={() => toggle(c.key)}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-gray-800">{c.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{c.description}</div>
              </div>
              <div
                className={clsx(
                  'shrink-0 w-9 h-5 rounded-full relative transition-colors mt-0.5',
                  on ? 'bg-astblue-600' : 'bg-gray-300'
                )}
              >
                <div
                  className={clsx(
                    'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all',
                    on ? 'left-[18px]' : 'left-0.5'
                  )}
                />
              </div>
            </div>
            {c.warning && on && (
              <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                <AlertTriangle size={14} className="shrink-0 mt-px" />
                <span>{c.warning}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
