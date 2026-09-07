'use client'

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
}

const accentMap = {
  blue: 'from-blue-500/15 to-blue-500/0 text-blue-600 dark:text-blue-400',
  purple: 'from-purple-500/15 to-purple-500/0 text-purple-600 dark:text-purple-400',
  red: 'from-red-500/15 to-red-500/0 text-red-600 dark:text-red-400',
  green: 'from-emerald-500/15 to-emerald-500/0 text-emerald-600 dark:text-emerald-400',
  amber: 'from-amber-500/15 to-amber-500/0 text-amber-600 dark:text-amber-400',
}

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  trend,
  accent = 'blue',
  className,
}: StatCardProps) {
  return (
    <Card className={cn('relative overflow-hidden p-5', className)}>
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-90',
          accentMap[accent],
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight">{value}</p>
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
        </div>
        <div
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-background/70 shadow-sm ring-1 ring-border',
            accentMap[accent].split(' ').pop(),
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  )
}
