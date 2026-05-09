import { useMemo } from 'react'
import { SimpleGrid, Paper, Text, Stack, type MantineTheme } from '@mantine/core'
import { BarChart, AreaChart, DonutChart } from '@mantine/charts'
import type { FeedsSnapshot } from '../types'

interface StatsPanelProps {
  data: FeedsSnapshot
}

export function StatsPanel({ data }: StatsPanelProps) {
  const sourceBarData = useMemo(
    () =>
      [...data.sources]
        .filter((s) => s.itemCount > 0)
        .sort((a, b) => b.itemCount - a.itemCount)
        .map((s) => ({ source: s.name, articles: s.itemCount })),
    [data.sources]
  )

  const timelineData = useMemo(() => {
    const buckets: Record<string, number> = {}
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const key = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      buckets[key] = 0
    }
    for (const item of data.items) {
      const pub = new Date(item.published)
      const ageMs = now.getTime() - pub.getTime()
      if (ageMs >= 0 && ageMs <= 14 * 24 * 60 * 60 * 1000) {
        const key = pub.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        if (key in buckets) buckets[key]++
      }
    }
    return Object.entries(buckets).map(([date, articles]) => ({ date, articles }))
  }, [data.items])

  const healthData = useMemo(() => {
    const ok = data.sources.filter((s) => s.ok).length
    const err = data.sources.filter((s) => !s.ok).length
    const segments = []
    if (ok > 0) segments.push({ name: 'Healthy', value: ok, color: 'brand.5' })
    if (err > 0) segments.push({ name: 'Error', value: err, color: 'red.6' })
    return segments
  }, [data.sources])

  return (
    <SimpleGrid cols={3} px="xl" py="md" spacing="md" style={{ flexShrink: 0 }}>
      <ChartCard title="ARTICLES PER SOURCE">
        <BarChart
          h={200}
          data={sourceBarData}
          dataKey="source"
          series={[{ name: 'articles', color: 'brand.5', label: 'Articles' }]}
          orientation="horizontal"
          withXAxis
          withYAxis
          withTooltip
          gridAxis="x"
          tickLine="none"
          yAxisProps={{ width: 140, tick: { fontSize: 10 } }}
        />
      </ChartCard>

      <ChartCard title="ARTICLES — LAST 14 DAYS">
        <AreaChart
          h={200}
          data={timelineData}
          dataKey="date"
          series={[{ name: 'articles', color: 'brand.5', label: 'Articles' }]}
          curveType="monotone"
          withDots={false}
          fillOpacity={0.15}
          withTooltip
          gridAxis="y"
          tickLine="none"
          xAxisProps={{ tick: { fontSize: 10 }, interval: 3 }}
        />
      </ChartCard>

      <ChartCard title="SOURCE HEALTH">
        <DonutChart
          data={healthData}
          h={200}
          withLabelsLine
          withLabels
          tooltipDataSource="segment"
          size={150}
          thickness={28}
          paddingAngle={4}
        />
      </ChartCard>
    </SimpleGrid>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper p="md" radius="sm" withBorder>
      <Stack gap="xs">
        <Text size="xs" ff="monospace" c="dimmed" style={{ letterSpacing: '0.1em' }}>
          {title}
        </Text>
        {children}
      </Stack>
    </Paper>
  )
}
