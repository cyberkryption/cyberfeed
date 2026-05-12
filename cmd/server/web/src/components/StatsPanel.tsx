import { useMemo } from 'react'
import { Stack, Paper, Text, Divider } from '@mantine/core'
import { BarChart, AreaChart, DonutChart } from '@mantine/charts'
import type { FeedsSnapshot } from '../types'

const CVE_SOURCE = 'CVE High and Critical'

// Matches any CVSS-range score (7.0–10.0) in free text.
const CVSS_RE = /\b(10\.0|[7-9]\.\d)\b/

interface StatsPanelProps {
  data: FeedsSnapshot
}

export default function StatsPanel({ data }: StatsPanelProps) {
  // ── Existing charts ───────────────────────────────────────────────────────

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

  // ── CVE charts ────────────────────────────────────────────────────────────

  const cveItems = useMemo(
    () => data.items.filter((i) => i.source === CVE_SOURCE),
    [data.items]
  )

  // Chart 1: CVE daily volume — last 7 days
  const cveDailyData = useMemo(() => {
    const buckets: Record<string, number> = {}
    const now = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(now.getDate() - i)
      const key = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      buckets[key] = 0
    }
    for (const item of cveItems) {
      const pub = new Date(item.published)
      const ageMs = now.getTime() - pub.getTime()
      if (ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000) {
        const key = pub.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
        if (key in buckets) buckets[key]++
      }
    }
    return Object.entries(buckets).map(([date, cves]) => ({ date, cves }))
  }, [cveItems])

  // Chart 2: CVSS score distribution
  const cvssData = useMemo(() => {
    const bands: Record<string, number> = {
      '10.0 (Perfect)': 0,
      '9.0 – 9.9': 0,
      '8.0 – 8.9': 0,
      '7.0 – 7.9': 0,
      'Score Unknown': 0,
    }
    for (const item of cveItems) {
      const text = `${item.title ?? ''} ${item.description ?? ''}`
      const match = text.match(CVSS_RE)
      if (!match) {
        bands['Score Unknown']++
      } else {
        const score = parseFloat(match[1])
        if (score === 10.0)      bands['10.0 (Perfect)']++
        else if (score >= 9.0)   bands['9.0 – 9.9']++
        else if (score >= 8.0)   bands['8.0 – 8.9']++
        else                     bands['7.0 – 7.9']++
      }
    }
    return Object.entries(bands)
      .filter(([, count]) => count > 0)
      .map(([band, count]) => ({ band, count }))
  }, [cveItems])

  // Chart 3: Top affected categories / products
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

  return (
    <Stack gap="md" p="md">

      {/* ── General charts ─────────────────────────────────────────────── */}
      <ChartCard title="ARTICLES PER SOURCE">
        <BarChart
          h={sourceBarData.length * 20 + 16}
          data={sourceBarData}
          dataKey="source"
          series={[{ name: 'articles', color: 'brand.5', label: 'Articles' }]}
          orientation="horizontal"
          withXAxis
          withYAxis
          withTooltip
          gridAxis="x"
          tickLine="none"
          yAxisProps={{ width: 110, tick: { fontSize: 10 } }}
          xAxisProps={{ tick: { fontSize: 10 } }}
        />
      </ChartCard>

      <ChartCard title="ARTICLES — LAST 14 DAYS">
        <AreaChart
          h={120}
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
          yAxisProps={{ tick: { fontSize: 10 } }}
        />
      </ChartCard>

      <ChartCard title="SOURCE HEALTH">
        <DonutChart
          data={healthData}
          h={150}
          withLabelsLine
          withLabels
          tooltipDataSource="segment"
          size={110}
          thickness={22}
          paddingAngle={4}
        />
      </ChartCard>

      {/* ── CVE High & Critical charts ──────────────────────────────────── */}
      {cveItems.length > 0 && (
        <>
          <Divider
            label="CVE HIGH &amp; CRITICAL"
            labelPosition="left"
            styles={{
              label: {
                fontFamily: 'monospace',
                fontSize: 10,
                letterSpacing: '0.1em',
                color: '#e03131',
                fontWeight: 700,
              },
            }}
          />

          <ChartCard title="CVE DAILY VOLUME — LAST 7 DAYS">
            <BarChart
              h={140}
              data={cveDailyData}
              dataKey="date"
              series={[{ name: 'cves', color: 'red.6', label: 'CVEs' }]}
              withTooltip
              withXAxis
              withYAxis
              gridAxis="y"
              tickLine="none"
              xAxisProps={{ tick: { fontSize: 10 } }}
              yAxisProps={{ tick: { fontSize: 10 }, allowDecimals: false }}
            />
          </ChartCard>

          {cvssData.length > 0 && (
            <ChartCard title="CVSS SCORE DISTRIBUTION">
              <BarChart
                h={cvssData.length * 28 + 16}
                data={cvssData}
                dataKey="band"
                series={[{ name: 'count', color: 'orange.6', label: 'CVEs' }]}
                orientation="horizontal"
                withXAxis
                withYAxis
                withTooltip
                gridAxis="x"
                tickLine="none"
                yAxisProps={{ width: 110, tick: { fontSize: 10 } }}
                xAxisProps={{ tick: { fontSize: 10 }, allowDecimals: false }}
              />
            </ChartCard>
          )}

          {topCategoriesData.length > 0 && (
            <ChartCard title="TOP AFFECTED CATEGORIES">
              <BarChart
                h={topCategoriesData.length * 26 + 16}
                data={topCategoriesData}
                dataKey="category"
                series={[{ name: 'count', color: 'brand.5', label: 'CVEs' }]}
                orientation="horizontal"
                withXAxis
                withYAxis
                withTooltip
                gridAxis="x"
                tickLine="none"
                yAxisProps={{ width: 130, tick: { fontSize: 10 } }}
                xAxisProps={{ tick: { fontSize: 10 }, allowDecimals: false }}
              />
            </ChartCard>
          )}
        </>
      )}

    </Stack>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper p="md" radius="sm" withBorder>
      <Text size="xs" ff="monospace" c="dimmed" mb="sm" style={{ letterSpacing: '0.1em' }}>
        {title}
      </Text>
      {children}
    </Paper>
  )
}
