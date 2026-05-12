import { useMemo } from 'react'
import { Stack, Paper, Text, Divider, useComputedColorScheme, Box } from '@mantine/core'
import { BarChart, AreaChart, DonutChart } from '@mantine/charts'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { IconGripVertical } from '@tabler/icons-react'
import { ALL_CHARTS } from '../charts'
import type { FeedsSnapshot } from '../types'

const CVE_SOURCE = 'CVE High and Critical'
const CVSS_RE = /\b(10\.0|[7-9]\.\d)\b/

// Returns true for RSS/Atom news sources; false for CSV-based threat intel feeds.
function isNewsUrl(url: string) {
  const lower = url.toLowerCase().split('?')[0]
  return !lower.endsWith('.csv')
}

interface StatsPanelProps {
  data: FeedsSnapshot
  visibleCharts: Set<string>
  chartOrder: string[]
  onReorderCharts: (newOrder: string[]) => void
}

export default function StatsPanel({
  data, visibleCharts, chartOrder, onReorderCharts,
}: StatsPanelProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'
  const tickColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  const cveHeaderColor = isDark ? '#00d47c' : '#007840'

  // ── CVE items ───────────────────────────────────────────────────────────────

  const cveItems = useMemo(
    () => data.items.filter((i) => i.source === CVE_SOURCE),
    [data.items]
  )

  const cveDailyData = useMemo(() => {
    type Bucket = { high: number; critical: number; unknown: number }
    const buckets: Record<string, Bucket> = {}
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const key = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      buckets[key] = { high: 0, critical: 0, unknown: 0 }
    }
    for (const item of cveItems) {
      const pub = new Date(item.published)
      const ageMs = now.getTime() - pub.getTime()
      if (ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000) {
        const key = pub.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        if (!(key in buckets)) continue
        const text = `${item.title ?? ''} ${item.description ?? ''}`
        const match = text.match(CVSS_RE)
        if (!match) {
          buckets[key].unknown++
        } else if (parseFloat(match[1]) >= 9.0) {
          buckets[key].critical++
        } else {
          buckets[key].high++
        }
      }
    }
    return Object.entries(buckets).map(([date, b]) => ({ date, ...b }))
  }, [cveItems])

  const cvssData = useMemo(() => {
    const counts: Record<string, number> = {
      'Score Unknown': 0, '7.0 – 7.9': 0, '8.0 – 8.9': 0,
      '9.0 – 9.9': 0, '10.0 (Critical)': 0,
    }
    for (const item of cveItems) {
      const text = `${item.title ?? ''} ${item.description ?? ''}`
      const match = text.match(CVSS_RE)
      if (!match) {
        counts['Score Unknown']++
      } else {
        const score = parseFloat(match[1])
        if (score === 10.0)    counts['10.0 (Critical)']++
        else if (score >= 9.0) counts['9.0 – 9.9']++
        else if (score >= 8.0) counts['8.0 – 8.9']++
        else                   counts['7.0 – 7.9']++
      }
    }
    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([band, count]) => ({ band, count }))
  }, [cveItems])

  const topCategoriesData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const item of cveItems) {
      for (const cat of (item.categories ?? [])) {
        const key = cat.trim()
        if (key) counts[key] = (counts[key] ?? 0) + 1
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([category, count]) => ({ category, count }))
  }, [cveItems])

  // ── General charts ──────────────────────────────────────────────────────────

  const sourceBarData = useMemo(
    () =>
      [...data.sources]
        .filter((s) => s.itemCount > 0 && isNewsUrl(s.url))
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
      if (!isNewsUrl(item.sourceUrl)) continue
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

  // ── Chart content map ───────────────────────────────────────────────────────

  const chartContent: Record<string, React.ReactNode> = {
    'cve-daily': (
      <ChartCard id="cve-daily" title="CVE DAILY VOLUME — LAST 7 DAYS" isDark={isDark}>
        <BarChart
          h={160}
          data={cveDailyData}
          dataKey="date"
          type="stacked"
          series={[
            { name: 'critical', color: 'red.6',    label: 'Critical (≥9.0)' },
            { name: 'high',     color: 'orange.5', label: 'High (7.0–8.9)' },
            { name: 'unknown',  color: 'gray.5',   label: 'Unknown score' },
          ]}
          withTooltip withLegend withXAxis withYAxis gridAxis="y" tickLine="none"
          xAxisProps={{ tick: { fontSize: 10, fill: tickColor } }}
          yAxisProps={{ tick: { fontSize: 10, fill: tickColor }, allowDecimals: false }}
        />
      </ChartCard>
    ),
    'cvss-dist': cvssData.length > 0 ? (
      <ChartCard id="cvss-dist" title="CVSS SCORE DISTRIBUTION" isDark={isDark}>
        <BarChart
          h={cvssData.length * 28 + 16}
          data={cvssData}
          dataKey="band"
          series={[{ name: 'count', color: 'brand.5', label: 'CVEs' }]}
          orientation="horizontal"
          withXAxis withYAxis withTooltip gridAxis="x" tickLine="none"
          yAxisProps={{ width: 120, tick: { fontSize: 10, fill: tickColor } }}
          xAxisProps={{ tick: { fontSize: 10, fill: tickColor }, allowDecimals: false }}
        />
      </ChartCard>
    ) : null,
    'cve-categories': topCategoriesData.length > 0 ? (
      <ChartCard id="cve-categories" title="TOP AFFECTED CATEGORIES" isDark={isDark}>
        <BarChart
          h={topCategoriesData.length * 26 + 16}
          data={topCategoriesData}
          dataKey="category"
          series={[{ name: 'count', color: 'brand.5', label: 'CVEs' }]}
          orientation="horizontal"
          withXAxis withYAxis withTooltip gridAxis="x" tickLine="none"
          yAxisProps={{ width: 130, tick: { fontSize: 10, fill: tickColor } }}
          xAxisProps={{ tick: { fontSize: 10, fill: tickColor }, allowDecimals: false }}
        />
      </ChartCard>
    ) : null,
    'articles-source': (
      <ChartCard id="articles-source" title="ARTICLES PER SOURCE" isDark={isDark}>
        <BarChart
          h={sourceBarData.length * 20 + 16}
          data={sourceBarData}
          dataKey="source"
          series={[{ name: 'articles', color: 'brand.5', label: 'Articles' }]}
          orientation="horizontal"
          withXAxis withYAxis withTooltip gridAxis="x" tickLine="none"
          yAxisProps={{ width: 110, tick: { fontSize: 10, fill: tickColor } }}
          xAxisProps={{ tick: { fontSize: 10, fill: tickColor } }}
        />
      </ChartCard>
    ),
    'articles-14d': (
      <ChartCard id="articles-14d" title="ARTICLES — LAST 14 DAYS" isDark={isDark}>
        <AreaChart
          h={120}
          data={timelineData}
          dataKey="date"
          series={[{ name: 'articles', color: 'brand.5', label: 'Articles' }]}
          curveType="monotone"
          withDots={false}
          fillOpacity={0.15}
          withTooltip gridAxis="y" tickLine="none"
          xAxisProps={{ tick: { fontSize: 10, fill: tickColor }, interval: 3 }}
          yAxisProps={{ tick: { fontSize: 10, fill: tickColor } }}
        />
      </ChartCard>
    ),
    'source-health': (
      <ChartCard id="source-health" title="SOURCE HEALTH" isDark={isDark}>
        <DonutChart
          data={healthData}
          h={150}
          withLabelsLine withLabels
          tooltipDataSource="segment"
          size={110} thickness={22} paddingAngle={4}
        />
      </ChartCard>
    ),
  }

  // ── Section ordering ─────────────────────────────────────────────────────────

  const chartSectionMap = Object.fromEntries(ALL_CHARTS.map((c) => [c.id, c.section]))

  const cveOrder = chartOrder.filter(
    (id) => chartSectionMap[id] === 'CVE' && visibleCharts.has(id)
  )
  const generalOrder = chartOrder.filter(
    (id) => chartSectionMap[id] === 'General' && visibleCharts.has(id)
  )

  const anyCveVisible = cveOrder.length > 0 && cveItems.length > 0
  const anyGeneralVisible = generalOrder.length > 0

  // ── Drag-and-drop ────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeSection = chartSectionMap[active.id as string]
    const overSection = chartSectionMap[over.id as string]
    if (activeSection !== overSection) return

    const oldIdx = chartOrder.indexOf(active.id as string)
    const newIdx = chartOrder.indexOf(over.id as string)
    if (oldIdx !== -1 && newIdx !== -1) {
      onReorderCharts(arrayMove(chartOrder, oldIdx, newIdx))
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <Stack gap="md" p="md">

        {/* ── CVE section ──────────────────────────────────────────────── */}
        {anyCveVisible && (
          <>
            <Divider
              label="CVE HIGH &amp; CRITICAL"
              labelPosition="left"
              styles={{
                label: {
                  fontFamily: 'monospace', fontSize: 10,
                  letterSpacing: '0.1em', color: cveHeaderColor, fontWeight: 700,
                },
              }}
            />
            <SortableContext items={cveOrder} strategy={verticalListSortingStrategy}>
              <Stack gap="md">
                {cveOrder.map((id) => chartContent[id] ?? null)}
              </Stack>
            </SortableContext>
          </>
        )}

        {/* ── General section ──────────────────────────────────────────── */}
        {anyGeneralVisible && (
          <>
            <Divider
              label="GENERAL"
              labelPosition="left"
              styles={{
                label: {
                  fontFamily: 'monospace', fontSize: 10,
                  letterSpacing: '0.1em',
                  color: isDark ? 'rgba(0,212,124,0.8)' : 'rgba(0,120,70,0.8)',
                  fontWeight: 700,
                },
              }}
            />
            <SortableContext items={generalOrder} strategy={verticalListSortingStrategy}>
              <Stack gap="md">
                {generalOrder.map((id) => chartContent[id] ?? null)}
              </Stack>
            </SortableContext>
          </>
        )}

      </Stack>
    </DndContext>
  )
}

// ── Sortable chart card ────────────────────────────────────────────────────────

interface ChartCardProps {
  id: string
  title: string
  isDark: boolean
  children: React.ReactNode
}

function ChartCard({ id, title, isDark, children }: ChartCardProps) {
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  }

  return (
    <Paper
      ref={setNodeRef}
      style={style}
      p="md"
      radius="sm"
      withBorder
    >
      <Box style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Box
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          style={{
            display: 'flex',
            alignItems: 'center',
            cursor: 'grab',
            color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
            flexShrink: 0,
            touchAction: 'none',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.color = isDark
              ? 'rgba(0,212,124,0.6)'
              : 'rgba(0,120,70,0.5)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.color = isDark
              ? 'rgba(255,255,255,0.2)'
              : 'rgba(0,0,0,0.2)'
          }}
        >
          <IconGripVertical size={14} />
        </Box>
        <Text size="xs" ff="monospace" c="dimmed" style={{ letterSpacing: '0.1em', flex: 1 }}>
          {title}
        </Text>
      </Box>
      {children}
    </Paper>
  )
}
