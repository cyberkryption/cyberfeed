import { useState, useMemo, useCallback, lazy, Suspense, useRef, useEffect } from 'react'
import {
  Box, Stack, Text, Center, Loader, Alert,
  Group, Pagination, useComputedColorScheme, ActionIcon, ScrollArea,
} from '@mantine/core'
import { IconX, IconBellOff } from '@tabler/icons-react'
import { useDisclosure } from '@mantine/hooks'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Header } from './components/Header'
import { LoginPage } from './components/LoginPage'
import { SourcesSidebar } from './components/SourcesSidebar'
import { FeedCard } from './components/FeedCard'
import { Toolbar } from './components/Toolbar'
import { TickerBar } from './components/TickerBar'
import { FeedAdminModal } from './components/FeedAdminModal'
import { WatchlistModal } from './components/WatchlistModal'
import { useFeeds } from './hooks/useFeeds'
import { useAuth } from './hooks/useAuth'
import { useReadItems } from './hooks/useReadItems'
import { useWatchlist } from './hooks/useWatchlist'
import { useWatchlistAlerts } from './hooks/useWatchlistAlerts'
import { ALL_CHARTS } from './charts'
import type { FeedItem } from './types'

const StatsPanel = lazy(() => import('./components/StatsPanel'))

const PAGE_SIZE_KEY = 'cyberfeed.pageSize'
const PAGE_SIZE_DEFAULT = 25

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
  const [adminOpened, { open: openAdmin, close: closeAdmin }] = useDisclosure(false)
  const [watchlistOpened, { open: openWatchlist, close: closeWatchlist }] = useDisclosure(false)
  const { keywords, addKeyword, removeKeyword } = useWatchlist()
  const { alerts, dismissAlert, dismissAll } = useWatchlistAlerts(data, keywords)
  const { readItems, markRead, toggleRead, clearAll } = useReadItems()
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
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
  const [pageSize, setPageSize] = useState<number>(() => {
    const stored = localStorage.getItem(PAGE_SIZE_KEY)
    const n = stored ? parseInt(stored, 10) : NaN
    return [10, 25, 50, 100].includes(n) ? n : PAGE_SIZE_DEFAULT
  })
  const [page, setPage] = useState(1)
  const isDark = useComputedColorScheme('dark') === 'dark'
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (error === 'HTTP 401') {
      onLogout()
    }
  }, [error, onLogout])

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
    let items = data.items

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
  }, [data, selectedSource, search, sortBy, hideRead, readItems])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))

  // Clamp page immediately so switching to a smaller source never shows an empty
  // feed while waiting for the reset effect to fire.
  const safePage = Math.min(page, totalPages)

  // Reset to page 1 whenever the active filters or page size change.
  useEffect(() => {
    setPage(1)
  }, [selectedSource, search, hideRead, sortBy, pageSize])

  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  const handlePageSizeChange = (size: number) => {
    localStorage.setItem(PAGE_SIZE_KEY, String(size))
    setPageSize(size)
  }

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
        onManageFeeds={openAdmin}
        onOpenWatchlist={openWatchlist}
        watchlistAlertCount={alerts.length}
      />

      <FeedAdminModal opened={adminOpened} onClose={closeAdmin} onRefresh={refresh} />
      <WatchlistModal
        opened={watchlistOpened}
        onClose={closeWatchlist}
        keywords={keywords}
        onAdd={addKeyword}
        onRemove={removeKeyword}
      />

      <TickerBar
        items={(data?.items ?? []).filter((i) => i.source === 'CVE High and Critical')}
        tickerSpeed={tickerSpeed}
      />

      {/* Watchlist alert strip */}
      {alerts.length > 0 && (
        <Box
          style={{
            borderBottom: isDark ? '1px solid rgba(255,140,0,0.25)' : '1px solid rgba(200,100,0,0.2)',
            background: isDark ? 'rgba(255,100,0,0.07)' : 'rgba(255,140,0,0.06)',
            flexShrink: 0,
          }}
        >
          <Group justify="space-between" align="center" px="md" py={4} style={{ flexWrap: 'nowrap' }}>
            <ScrollArea scrollbarSize={4} style={{ flex: 1, minWidth: 0 }}>
              <Group gap="xs" wrap="nowrap" py={2}>
                {alerts.map((alert) => (
                  <Group
                    key={alert.id}
                    gap={4}
                    align="center"
                    wrap="nowrap"
                    style={{
                      background: isDark ? 'rgba(255,140,0,0.12)' : 'rgba(255,140,0,0.1)',
                      border: isDark ? '1px solid rgba(255,140,0,0.25)' : '1px solid rgba(200,100,0,0.2)',
                      borderRadius: 4,
                      padding: '2px 6px',
                      flexShrink: 0,
                      maxWidth: 340,
                    }}
                  >
                    <Text
                      size="xs"
                      ff="monospace"
                      fw={700}
                      style={{ color: isDark ? '#f08c00' : '#b05c00', whiteSpace: 'nowrap', fontSize: 10 }}
                    >
                      [{alert.keyword}]
                    </Text>
                    <Text
                      size="xs"
                      component="a"
                      href={alert.item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 220,
                        display: 'block',
                        color: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)',
                        textDecoration: 'none',
                        fontSize: 11,
                      }}
                      title={alert.item.title}
                    >
                      {alert.item.title}
                    </Text>
                    <ActionIcon
                      size={14}
                      variant="transparent"
                      color="gray"
                      onClick={() => dismissAlert(alert.id)}
                      aria-label="Dismiss alert"
                      style={{ flexShrink: 0 }}
                    >
                      <IconX size={10} />
                    </ActionIcon>
                  </Group>
                ))}
              </Group>
            </ScrollArea>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              onClick={dismissAll}
              aria-label="Dismiss all watchlist alerts"
              title="Dismiss all"
              style={{ flexShrink: 0, marginLeft: 4 }}
            >
              <IconBellOff size={14} />
            </ActionIcon>
          </Group>
        </Box>
      )}

      {/* Body row: sidebar | resizable(feed + stats) */}
      <Box style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Left sources sidebar — fixed width, outside the resizable group */}
        {data && (
          <SourcesSidebar
            sources={data.sources}
            selectedSource={selectedSource}
            onSelectSource={setSelectedSource}
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
                pageSize={pageSize}
                onPageSizeChange={handlePageSizeChange}
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
                        value={safePage}
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
                      {totalPages > 1
                        ? `PAGE ${safePage} OF ${totalPages} · ${filtered.length} ITEMS · `
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
