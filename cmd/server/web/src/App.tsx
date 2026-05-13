import { useState, useMemo, lazy, Suspense } from 'react'
import {
  Box, Stack, Text, Center, Loader, Alert,
  Group, useComputedColorScheme
} from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Header } from './components/Header'
import { SourcesSidebar } from './components/SourcesSidebar'
import { FeedCard } from './components/FeedCard'
import { Toolbar } from './components/Toolbar'
import { useFeeds } from './hooks/useFeeds'
import type { FeedItem } from './types'

const StatsPanel = lazy(() => import('./components/StatsPanel'))

export default function App() {
  const { data, loading, error, refresh, lastRefreshed } = useFeeds()
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'source'>('date')
  const [showStats, setShowStats] = useState(true)
  const isDark = useComputedColorScheme('dark') === 'dark'

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
          i.title.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.source.toLowerCase().includes(q) ||
          i.author.toLowerCase().includes(q) ||
          i.categories.some((c) => c.toLowerCase().includes(q))
      )
    }

    if (sortBy === 'source') {
      items = [...items].sort((a, b) => {
        const s = a.source.localeCompare(b.source)
        if (s !== 0) return s
        return new Date(b.published).getTime() - new Date(a.published).getTime()
      })
    }

    return items
  }, [data, selectedSource, search, sortBy])

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
      />

      <Box style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Left sources sidebar */}
        {data && (
          <SourcesSidebar
            sources={data.sources}
            selectedSource={selectedSource}
            onSelectSource={setSelectedSource}
          />
        )}

        {/* Feed column — fixed reading width so charts can fill the rest */}
        <Box
          style={{
            flexBasis: 820,
            flexShrink: 1,
            flexGrow: 0,
            minWidth: 380,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {data && (
            <Toolbar
              search={search}
              onSearchChange={setSearch}
              sortBy={sortBy}
              onSortChange={setSortBy}
              visibleCount={filtered.length}
              totalCount={data.items.length}
              showStats={showStats}
              onToggleStats={() => setShowStats((v) => !v)}
            />
          )}

          <Box style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
            {error && !data && (
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

            {data && (
              <>
                {filtered.length === 0 ? (
                  <Center h={200}>
                    <Text c="dimmed" ff="monospace" size="sm">
                      {search ? 'NO RESULTS FOUND' : 'NO ITEMS TO DISPLAY'}
                    </Text>
                  </Center>
                ) : (
                  <Stack gap="sm">
                    {filtered.map((item, idx) => (
                      <FeedCard
                        key={`${item.source}-${item.link}-${idx}`}
                        item={item}
                        searchQuery={search}
                      />
                    ))}
                  </Stack>
                )}
              </>
            )}

            {data && (
              <Group justify="center" mt="xl" mb="md">
                <Text size="xs" c="dimmed" ff="monospace" style={{ opacity: 0.5, letterSpacing: '0.06em' }}>
                  SERVER LAST UPDATED: {new Date(data.updatedAt).toLocaleString()}
                  {' · '}NEXT REFRESH IN ~15 MINUTES
                </Text>
              </Group>
            )}
          </Box>
        </Box>

        {/* Charts panel — flex:1 fills all remaining space */}
        {data && showStats && (
          <Box
            style={{
              flex: 1,
              minWidth: 400,
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              borderLeft: isDark
                ? '1px solid rgba(0,212,124,0.1)'
                : '1px solid rgba(0,120,70,0.08)',
              background: isDark
                ? 'rgba(13,18,16,0.6)'
                : 'rgba(238,247,242,0.6)',
            }}
          >
            <Suspense
              fallback={
                <Center h={200}>
                  <Loader size="sm" color="brand" type="dots" />
                </Center>
              }
            >
              <StatsPanel data={data} />
            </Suspense>
          </Box>
        )}
      </Box>
    </Box>
  )
}
