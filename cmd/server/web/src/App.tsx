import { useState, useMemo, useCallback, lazy, Suspense, useRef, useEffect } from 'react'
import {
  Box, Stack, Text, Center, Loader, Alert,
  Group, Pagination, useComputedColorScheme
} from '@mantine/core'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Header } from './components/Header'
import { LoginPage } from './components/LoginPage'
import { SourcesSidebar } from './components/SourcesSidebar'
import { FeedCard } from './components/FeedCard'
import { Toolbar } from './components/Toolbar'
import { TickerBar } from './components/TickerBar'
import { useFeeds } from './hooks/useFeeds'
import { useAuth } from './hooks/useAuth'
import { useReadItems } from './hooks/useReadItems'
import { ALL_CHARTS } from './charts'
import type { FeedItem } from './types'

const StatsPanel = lazy(() => import('./components/StatsPanel'))

const PAGE_SIZE = 25

function ResizeHandle({ isDark }: { isDark: boolean }) {
  return (
    <Box
      style={{
        width: 8,
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'col-resize',
        flexShrink: 0,
        borderLeft: isDark ? '1px solid rgba(0,212,124,0.1)' : '1px solid rgba(0,120,70,0.08)',
        transition: 'background 0.15s',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = isDark
          ? 'rgba(0,212,124,0.08)'
          : 'rgba(0,120,70,0.06)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      <Box
        style={{
          width: 3,
          height: 32,
          borderRadius: 2,
          background: isDark ? 'rgba(0,212,124,0.25)' : 'rgba(0,120,70,0.18)',
        }}
      />
    </Box>
  )
}

interface FeedAppProps {
  username: string | null
  onLogout: () => void
}

function FeedApp({ username, onLogout }: FeedAppProps) {
  const { data, loading, error, refresh, lastRefreshed } = useFeeds()
  const { readItems, markRead, toggleRead, clearAll } = useReadItems()
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [disabledSources, setDisabledSources] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'source'>('date')
  const [hideRead, setHideRead] = useState(false)
  const [visibleCharts, setVisibleCharts] = useState<Set<string>>(
    () => new Set(ALL_CHARTS.map((c) => c.id))
  )
  const [chartOrder, setChartOrder] = useState<string[]>(
    () => ALL_CHARTS.map((c) => c.id)
  )
  const [tickerSpeed, setTickerSpeed] = useState(100)
  const [page, setPage] = useState(1)
  const isDark = useComputedColorScheme('dark') === 'dark'
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (error === 'HTTP 401') {
      onLogout()
    }
  }, [error, onLogout])

  const handleToggleSource = useCallback((name: string) => {
    setDisabledSources((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
    setSelectedSource((sel) => (sel === name ? null : sel))
  }, [])

  const handleToggleChart = useCallback((id: string) => {
    setVisibleCharts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleReorderCharts = useCallback((newOrder: string[]) => {
    setChartOrder(newOrder)
  }, [])

  const showStats = visibleCharts.size > 0

  const filtered = useMemo<FeedItem[]>(() => {
    if (!data?.items) return []
    let items = data.items.filter((i) => !disabledSources.has(i.source))

    if (selectedSource) {
      items = items.filter((i) => i.source === selectedSource)
    }

    const q = search.trim().toLowerCase()
    if (q) {
      items = items.filter(
        (i) =>
          (i.title ?? '').toLowerCase().includes(q) ||
          (i.description ?? '').toLowerCase().includes(q) ||
          (i.source ?? '').toLowerCase().includes(q) ||
          (i.author ?? '').toLowerCase().includes(q) ||
          (i.categories ?? []).some((c) => c.toLowerCase().includes(q))
      )
    }

    if (hideRead) {
      items = items.filter((i) => !readItems.has(i.link))
    }

    if (sortBy === 'source') {
      items = [...items].sort((a, b) => {
        const s = a.source.localeCompare(b.source)
        if (s !== 0) return s
        return new Date(b.published).getTime() - new Date(a.published).getTime()
      })
    }

    return items
  }, [data, selectedSource, disabledSources, search, sortBy, hideRead, readItems])

  // Reset to page 1 whenever the filtered set changes.
  useEffect(() => {
    setPage(1)
  }, [filtered])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handlePageChange = (p: number) => {
    setPage(p)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const readCount = useMemo(
    () => (data?.items ?? []).filter((i) => readItems.has(i.link)).length,
    [data, readItems]
  )

  const activeSources = data?.sources.filter((s) => s.ok).length ?? 0

  return (
    <Box
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: isDark
          ? 'linear-gradient(160deg, #101113 0%, #14171a 50%, #0d1210 100%)'
          : 'linear-gradient(160deg, #f5faf7 0%, #eef7f2 100%)',
      }}
    >
      <Header
        onRefresh={refresh}
        loading={loading}
        lastRefreshed={lastRefreshed}
        totalItems={data?.items.length ?? 0}
        activeSources={activeSources}
        serverUpdatedAt={data?.updatedAt ?? null}
        tickerSpeed={tickerSpeed}
        onTickerSpeedChange={setTickerSpeed}
        username={username}
        onLogout={onLogout}
      />

      <TickerBar
        items={(data?.items ?? []).filter(
          (i) => i.source === 'CVE High and Critical' && !disabledSources.has(i.source)
        )}
        tickerSpeed={tickerSpeed}
      />

      {/* Body row: sidebar | resizable(feed + stats) */}
      <Box style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Left sources sidebar — fixed width, outside the resizable group */}
        {data && (
          <SourcesSidebar
            sources={data.sources}
            selectedSource={selectedSource}
            onSelectSource={setSelectedSource}
            disabledSources={disabledSources}
            onToggleSource={handleToggleSource}
          />
        )}

        {/* Feed + stats: draggable splitter between them */}
        <PanelGroup
          direction="horizontal"
          style={{ flex: 1, minWidth: 0 }}
        >
          {/* Feed panel */}
          <Panel defaultSize={65} minSize={40} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {data && (
              <Toolbar
                search={search}
                onSearchChange={setSearch}
                sortBy={sortBy}
                onSortChange={setSortBy}
                visibleCount={filtered.length}
                totalCount={data.items.length}
                visibleCharts={visibleCharts}
                onToggleChart={handleToggleChart}
                hideRead={hideRead}
                onToggleHideRead={() => setHideRead((v) => !v)}
                readCount={readCount}
                onClearRead={clearAll}
              />
            )}

            <Box ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
              {error && !data && error !== 'HTTP 401' && (
                <Alert
                  icon={<IconAlertTriangle size={16} />}
                  color="red"
                  title="Failed to load feeds"
                  mt="xl"
                  maw={600}
                  mx="auto"
                >
                  {error} — The server may still be loading feeds for the first time. Please wait and refresh.
                </Alert>
              )}

              {loading && !data && (
                <Center h={300}>
                  <Stack align="center" gap="md">
                    <Loader size="lg" color="brand" type="dots" />
                    <Text c="dimmed" ff="monospace" size="sm" style={{ letterSpacing: '0.08em' }}>
                      FETCHING FEEDS…
                    </Text>
                    <Text c="dimmed" size="xs">
                      This may take up to 15 seconds on first load
                    </Text>
                  </Stack>
                </Center>
              )}

              {data && filtered.length === 0 && (
                <Center h={200}>
                  <Text c="dimmed" ff="monospace" size="sm">
                    {search ? 'NO RESULTS FOUND' : hideRead ? 'ALL ITEMS READ' : 'NO ITEMS TO DISPLAY'}
                  </Text>
                </Center>
              )}

              {data && pageItems.length > 0 && (
                <Box style={{ maxWidth: 900 }}>
                  <Stack gap={8}>
                    {pageItems.map((item) => (
                      <FeedCard
                        key={item.link}
                        item={item}
                        searchQuery={search}
                        isRead={readItems.has(item.link)}
                        onToggleRead={() => toggleRead(item.link)}
                        onMarkRead={() => markRead(item.link)}
                      />
                    ))}
                  </Stack>

                  {totalPages > 1 && (
                    <Group justify="center" mt="xl" mb="sm">
                      <Pagination
                        value={page}
                        onChange={handlePageChange}
                        total={totalPages}
                        color="brand"
                        size="sm"
                        radius="sm"
                        withEdges
                        styles={{
                          control: {
                            fontFamily: 'monospace',
                            fontSize: 11,
                            letterSpacing: '0.04em',
                          },
                        }}
                      />
                    </Group>
                  )}

                  <Group justify="center" mt={totalPages > 1 ? 'xs' : 'xl'} mb="md">
                    <Text size="xs" c="dimmed" ff="monospace" style={{ opacity: 0.5, letterSpacing: '0.06em' }}>
                      {filtered.length > PAGE_SIZE
                        ? `PAGE ${page} OF ${totalPages} · ${filtered.length} ITEMS · `
                        : ''}
                      SERVER LAST UPDATED: {new Date(data.updatedAt).toLocaleString()}
                      {' · '}NEXT REFRESH IN ~20 MINUTES
                    </Text>
                  </Group>
                </Box>
              )}
            </Box>
          </Panel>

          {/* Drag handle + stats panel — only rendered when stats are visible */}
          {data && showStats && (
            <>
              <PanelResizeHandle>
                <ResizeHandle isDark={isDark} />
              </PanelResizeHandle>

              <Panel defaultSize={35} minSize={20} maxSize={55} style={{ overflow: 'hidden', position: 'relative' }}>
                <Box
                  style={{
                    position: 'absolute',
                    inset: 0,
                    overflowY: 'auto',
                    background: isDark ? 'rgba(13,18,16,0.6)' : 'rgba(238,247,242,0.6)',
                  }}
                >
                  <Suspense
                    fallback={
                      <Center h={200}>
                        <Loader size="sm" color="brand" type="dots" />
                      </Center>
                    }
                  >
                    <StatsPanel
                      data={data}
                      visibleCharts={visibleCharts}
                      chartOrder={chartOrder}
                      onReorderCharts={handleReorderCharts}
                    />
                  </Suspense>
                </Box>
              </Panel>
            </>
          )}
        </PanelGroup>
      </Box>
    </Box>
  )
}

export default function App() {
  const auth = useAuth()

  if (auth.loading) {
    return (
      <Center h="100vh">
        <Loader size="lg" color="brand" type="dots" />
      </Center>
    )
  }

  if (!auth.authenticated) {
    return <LoginPage onLogin={auth.login} />
  }

  return <FeedApp username={auth.username} onLogout={auth.logout} />
}
