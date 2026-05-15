import { useMemo } from 'react'
import { Stack, Paper, Text, Divider, useComputedColorScheme, Box, Group } from '@mantine/core'
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

// One colour per keyword slot — mirrors the palette used across the other charts.
const WATCHLIST_PALETTE = [
  'brand.5', 'orange.5', 'red.6', 'blue.5', 'violet.5',
  'teal.5',  'yellow.6', 'pink.5', 'cyan.5', 'grape.5',
]

interface StatsPanelProps {
  data: FeedsSnapshot
  visibleCharts: Set<string>
  chartOrder: string[]
  onReorderCharts: (newOrder: string[]) => void
  keywords: string[]
}

export default function StatsPanel({
  data, visibleCharts, chartOrder, onReorderCharts, keywords,
}: StatsPanelProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'
  const tickColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  const cveHeaderColor = isDark ? '#00d47c' : '#007840'

  // ── Watchlist hits ──────────────────────────────────────────────────────────

  const watchlistChartData = useMemo(() => {
    if (keywords.length === 0) return { rows: [], series: [] }
    // Assign a stable palette slot based on original keyword index (before sort)
    // so colours don't shift as hit counts change.
    const byKeyword = keywords.map((kw, i) => {
      const lower = kw.toLowerCase()
      const hits = data.items.filter((item) =>
        (item.title       ?? '').toLowerCase().includes(lower) ||
        (item.description ?? '').toLowerCase().includes(lower) ||
        (item.source      ?? '').toLowerCase().includes(lower) ||
        (item.author      ?? '').toLowerCase().includes(lower) ||
        (item.categories  ?? []).some((c) => c.toLowerCase().includes(lower))
      ).length
      return { kw, hits, key: `k${i}`, color: WATCHLIST_PALETTE[i % WATCHLIST_PALETTE.length] }
    }).sort((a, b) => b.hits - a.hits)

    // One data row per keyword; only that keyword's series key is set so each
    // bar renders in its own colour without polluting the other rows.
    const rows = byKeyword.map(({ kw, hits, key }) => ({ keyword: kw, [key]: hits }))
    const series = byKeyword.map(({ kw, key, color }) => ({ name: key, label: kw, color }))
    return { rows, series }
  }, [keywords, data.items])

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
    const bands = [
      { key: 'critical-10', label: 'CRITICAL',  sublabel: 'CVSS 10.0',     accent: '#c92a2a', count: 0 },
      { key: 'critical-9',  label: 'CRITICAL',  sublabel: 'CVSS 9.0 – 9.9', accent: '#e03131', count: 0 },
      { key: 'high-8',      label: 'HIGH',       sublabel: 'CVSS 8.0 – 8.9', accent: '#e8590c', count: 0 },
      { key: 'high-7',      label: 'HIGH',       sublabel: 'CVSS 7.0 – 7.9', accent: '#f08c00', count: 0 },
      { key: 'unknown',     label: 'UNKNOWN',    sublabel: 'No score found',  accent: '#868e96', count: 0 },
    ]
    for (const item of cveItems) {
      const text = `${item.title ?? ''} ${item.description ?? ''}`
      const match = text.match(CVSS_RE)
      if (!match) {
        bands[4].count++
      } else {
        const score = parseFloat(match[1])
        if (score === 10.0)    bands[0].count++
        else if (score >= 9.0) bands[1].count++
        else if (score >= 8.0) bands[2].count++
        else                   bands[3].count++
      }
    }
    return bands
  }, [cveItems])

  const tagCloudWords = useMemo(() => {
    // Palette mirrors the colours used across the other charts (dark / light variants).
    const darkPalette  = ['#00d47c', '#f08c00', '#e03131', '#228be6', '#ae3ec9', '#e8590c', '#2f9e44', '#f76707']
    const lightPalette = ['#007840', '#d97706', '#c92a2a', '#1c7ed6', '#9c36b5', '#d1580a', '#2f9e44', '#e8590c']

    const counts: Record<string, number> = {}
    for (const item of data.items) {
      for (const cat of (item.categories ?? [])) {
        const key = cat.trim().toUpperCase()
        if (key) counts[key] = (counts[key] ?? 0) + 1
      }
    }
    const entries = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
    if (entries.length === 0) return []
    const maxCount = entries[0][1]
    const minCount = entries[entries.length - 1][1]
    const range = maxCount === minCount ? 1 : maxCount - minCount
    return entries.map(([word, count], i) => ({
      word,
      count,
      // Font size 12 – 28 px proportional to frequency
      size: Math.round(12 + ((count - minCount) / range) * 16),
      // Opacity 0.6 – 1.0 (narrower range since colour already conveys prominence)
      opacity: 0.6 + ((count - minCount) / range) * 0.4,
      darkColor:  darkPalette[i % darkPalette.length],
      lightColor: lightPalette[i % lightPalette.length],
    }))
  }, [data.items])

  // ── General charts ──────────────────────────────────────────────────────────

  const sourceBarData = useMemo(() => {
    const cols = ['c0', 'c1', 'c2'] as const
    return [...data.sources]
      .filter((s) => s.itemCount > 0 && isNewsUrl(s.url))
      .sort((a, b) => b.itemCount - a.itemCount)
      .map((s, i) => ({ source: s.name, [cols[i % 3]]: s.itemCount }))
  }, [data.sources])

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
    function buildSegments(sources: typeof data.sources, healthyColor: string) {
      const ok  = sources.filter((s) => s.ok).length
      const err = sources.filter((s) => !s.ok).length
      const segments = []
      if (ok  > 0) segments.push({ name: 'Healthy', value: ok,  color: healthyColor })
      if (err > 0) segments.push({ name: 'Error',   value: err, color: 'red.6'      })
      return segments
    }
    const news = data.sources.filter((s) =>  isNewsUrl(s.url))
    const c2   = data.sources.filter((s) => !isNewsUrl(s.url))
    return {
      news: buildSegments(news, 'brand.5'),
      c2:   buildSegments(c2,   'orange.5'),
    }
  }, [data.sources])

  // ── Chart content map ───────────────────────────────────────────────────────

  const chartContent: Record<string, React.ReactNode> = {
    'watchlist-hits': (
      <ChartCard id="watchlist-hits" title="WATCHLIST — HITS PER KEYWORD" isDark={isDark}>
        {keywords.length === 0 ? (
          <Text size="xs" c="dimmed" ff="monospace" ta="center" py="lg"
            style={{ letterSpacing: '0.06em' }}>
            NO KEYWORDS CONFIGURED — OPEN WATCHLIST TO ADD SOME
          </Text>
        ) : (
          <BarChart
            h={Math.max(watchlistChartData.rows.length * 30 + 16, 80)}
            data={watchlistChartData.rows}
            dataKey="keyword"
            series={watchlistChartData.series}
            type="stacked"
            orientation="horizontal"
            withXAxis
            withYAxis
            withTooltip
            gridAxis="x"
            tickLine="none"
            yAxisProps={{ width: 100, tick: { fontSize: 10, fill: tickColor } }}
            xAxisProps={{ tick: { fontSize: 10, fill: tickColor }, allowDecimals: false }}
          />
        )}
      </ChartCard>
    ),
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
    'cvss-dist': (
      <ChartCard id="cvss-dist" title="CVE SEVERITY SCORECARD" isDark={isDark}>
        <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {cvssData.slice(0, 4).map(({ key, ...rest }) => (
            <ScorecardCell key={key} {...rest} isDark={isDark} />
          ))}
          <Box style={{ gridColumn: '1 / -1' }}>
            {(() => { const { key: _k, ...rest } = cvssData[4]; return <ScorecardCell {...rest} isDark={isDark} /> })()}
          </Box>
        </Box>
      </ChartCard>
    ),
    'cve-categories': (
      <ChartCard id="cve-categories" title="IOT CYBER TAG CLOUD" isDark={isDark}>
        {tagCloudWords.length > 0 ? (
          <Box
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px 10px',
              alignItems: 'baseline',
              padding: '4px 0',
            }}
          >
            {tagCloudWords.map(({ word, count, size, opacity, darkColor, lightColor }) => (
              <Text
                key={word}
                ff="monospace"
                title={`${word}: ${count}`}
                style={{
                  fontSize: size,
                  opacity,
                  color: isDark ? darkColor : lightColor,
                  fontWeight: size >= 22 ? 700 : size >= 16 ? 600 : 400,
                  letterSpacing: '0.02em',
                  lineHeight: 1.3,
                  cursor: 'default',
                  transition: 'opacity 0.15s',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = String(opacity) }}
              >
                {word}
              </Text>
            ))}
          </Box>
        ) : (
          <Text size="xs" c="dimmed" ff="monospace" ta="center" py="lg"
            style={{ letterSpacing: '0.06em' }}>
            NO TAG DATA IN CURRENT FEED
          </Text>
        )}
      </ChartCard>
    ),
    'articles-source': (
      <ChartCard id="articles-source" title="ARTICLES PER SOURCE" isDark={isDark}>
        <BarChart
          h={sourceBarData.length * 20 + 16}
          data={sourceBarData}
          dataKey="source"
          type="stacked"
          series={[
            { name: 'c0', color: 'red.6',    label: 'Articles' },
            { name: 'c1', color: 'orange.5', label: 'Articles' },
            { name: 'c2', color: 'gray.5',   label: 'Articles' },
          ]}
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
          series={[{ name: 'articles', color: 'orange.5', label: 'Articles' }]}
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
        <Group grow align="flex-start" gap="xs">
          <Box>
            <Text size="xs" ff="monospace" ta="center" c="dimmed" mb={4}
              style={{ letterSpacing: '0.08em', fontSize: 9 }}>
              NEWS
            </Text>
            <DonutChart
              data={healthData.news}
              h={130}
              withLabelsLine withLabels
              tooltipDataSource="segment"
              size={90} thickness={18} paddingAngle={4}
            />
          </Box>
          <Box>
            <Text size="xs" ff="monospace" ta="center" c="dimmed" mb={4}
              style={{ letterSpacing: '0.08em', fontSize: 9 }}>
              THREAT INTEL
            </Text>
            <DonutChart
              data={healthData.c2}
              h={130}
              withLabelsLine withLabels
              tooltipDataSource="segment"
              size={90} thickness={18} paddingAngle={4}
            />
          </Box>
        </Group>
      </ChartCard>
    ),
  }

  // ── Section ordering ─────────────────────────────────────────────────────────

  const chartSectionMap = Object.fromEntries(ALL_CHARTS.map((c) => [c.id, c.section]))

  const watchlistOrder = chartOrder.filter(
    (id) => chartSectionMap[id] === 'Watchlist' && visibleCharts.has(id)
  )
  const cveOrder = chartOrder.filter(
    (id) => chartSectionMap[id] === 'CVE' && visibleCharts.has(id)
  )
  const generalOrder = chartOrder.filter(
    (id) => chartSectionMap[id] === 'General' && visibleCharts.has(id)
  )

  const anyWatchlistVisible = watchlistOrder.length > 0
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

        {/* ── Watchlist section ────────────────────────────────────────── */}
        {anyWatchlistVisible && (
          <>
            <Divider
              label="WATCHLIST"
              labelPosition="left"
              styles={{
                label: {
                  fontFamily: 'monospace', fontSize: 10,
                  letterSpacing: '0.1em',
                  color: isDark ? 'rgba(240,140,0,0.9)' : 'rgba(160,90,0,0.9)',
                  fontWeight: 700,
                },
              }}
            />
            <SortableContext items={watchlistOrder} strategy={verticalListSortingStrategy}>
              <Stack gap="md">
                {watchlistOrder.map((id) => chartContent[id] ?? null)}
              </Stack>
            </SortableContext>
          </>
        )}

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

// ── Scorecard cell ─────────────────────────────────────────────────────────────

interface ScorecardCellProps {
  label: string
  sublabel: string
  accent: string
  count: number
  isDark: boolean
}

function ScorecardCell({ label, sublabel, accent, count, isDark }: ScorecardCellProps) {
  return (
    <Paper
      radius="sm"
      withBorder
      p="sm"
      style={{
        borderTop: `3px solid ${accent}`,
        background: isDark
          ? `color-mix(in srgb, ${accent} 8%, transparent)`
          : `color-mix(in srgb, ${accent} 5%, transparent)`,
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Box>
          <Text
            size="xs"
            ff="monospace"
            fw={700}
            style={{ letterSpacing: '0.08em', color: accent, lineHeight: 1 }}
          >
            {label}
          </Text>
          <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: 9, letterSpacing: '0.06em', marginTop: 2 }}>
            {sublabel}
          </Text>
        </Box>
        <Text
          fw={800}
          ff="monospace"
          style={{ fontSize: 28, lineHeight: 1, color: accent }}
        >
          {count}
        </Text>
      </Group>
    </Paper>
  )
}
