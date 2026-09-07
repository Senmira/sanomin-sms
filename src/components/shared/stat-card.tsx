'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import type { LucideIcon } from 'lucide-react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

interface StatCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  hint?: string
  trend?: number
  accent?: 'blue' | 'purple' | 'red' | 'green' | 'amber'
  className?: string
  footer?: ReactNode
}

const accentMap = {
  blue: 'from-blue-500/15 to-blue-500/0 text-blue-600 dark:text-blue-400',
  purple: 'from-purple-500/15 to-purple-500/0 text-purple-600 dark:text-purple-400',
  red: 'from-red-500/15 to-red-500/0 text-red-600 dark:text-red-400',
  green: 'from-emerald-500/15 to-emerald-500/0 text-emerald-600 dark:text-emerald-400',
  amber: 'from-amber-500/15 to-amber-500/0 text-amber-600 dark:text-amber-400',
}

const accentBar: Record<string, string> = {
  blue: 'bg-gradient-to-r from-blue-500/70 to-blue-400/0',
  purple: 'bg-gradient-to-r from-purple-500/70 to-purple-400/0',
  red: 'bg-gradient-to-r from-red-500/70 to-red-400/0',
  green: 'bg-gradient-to-r from-emerald-500/70 to-emerald-400/0',
  amber: 'bg-gradient-to-r from-amber-500/70 to-amber-400/0',
}

const accentColor: Record<string, string> = {
  blue: '#1e40af',
  purple: '#7c3aed',
  red: '#dc2626',
  green: '#16a34a',
  amber: '#d97706',
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  trend,
  accent = 'blue',
  className,
  footer,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        // Hover micro-interaction: lift + shadow + accent ring
        'card-lift group relative overflow-hidden p-5 hover:shadow-md hover:ring-1',
        'hover:ring-primary/10',
        className,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90 transition-opacity duration-200 group-hover:opacity-100',
          accentMap[accent],
        )}
      />
      {/* Accent strip along the top edge — deepens on hover */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-[3px] opacity-60 transition-opacity duration-200 group-hover:opacity-100',
          accentBar[accent],
        )}
      />
      {/* Oversized watermark icon bleeding off the bottom-right corner */}
      <Icon
        className="pointer-events-none absolute -bottom-4 -right-3 h-24 w-24 rotate-[-8deg] text-foreground/[0.035] transition-transform duration-300 group-hover:scale-110 dark:text-white/[0.05]"
        strokeWidth={1.2}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          {typeof trend === 'number' && (
            <div
              className={cn(
                'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                trend >= 0
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400',
              )}
            >
              {trend >= 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(trend)}%
            </div>
          )}
          {footer && <div className="mt-2">{footer}</div>}
        </div>
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background/70 shadow-sm ring-1 ring-border transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-3',
            accentMap[accent].split(' ').pop(),
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}

export { accentColor as STAT_ACCENT_COLOR }
