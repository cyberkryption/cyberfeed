import {
  Stack, Text, Badge, Box, Tooltip, ScrollArea,
  ThemeIcon, Group, useComputedColorScheme, Divider, Alert,
} from '@mantine/core'
import { IconCircleCheck, IconCircleX, IconExternalLink, IconAlertTriangle } from '@tabler/icons-react'
import type { FeedStatus } from '../types'

const ALERT_THRESHOLD = 3

interface SourcesSidebarProps {
  sources: FeedStatus[]
  selectedSource: string | null
  onSelectSource: (source: string | null) => void
}

function isThreatIntel(s: FeedStatus): boolean {
  if (s.category === 'news') return false
  if (s.category === 'threat_intel') return true
  // "auto": treat .csv and .json URLs as threat intel
  const lower = s.url.toLowerCase().split('?')[0]
  return lower.endsWith('.csv') || lower.endsWith('.json')
}

interface SectionProps {
  label: string
  sources: FeedStatus[]
  selectedSource: string | null
  onSelectSource: (source: string | null) => void
  isDark: boolean
}

function SourceSection({ label, sources, selectedSource, onSelectSource, isDark }: SectionProps) {
  if (sources.length === 0) return null

  return (
    <>
      <Box px="sm" pt="sm" pb={2}>
        <Text
          size="xs"
          fw={700}
          ff="monospace"
          style={{
            letterSpacing: '0.1em',
            fontSize: 10,
            color: isDark ? 'rgba(0,212,124,0.5)' : 'rgba(0,120,70,0.55)',
          }}
        >
          {label}
        </Text>
      </Box>
      <Divider
        mx="sm"
        mb={2}
        color={isDark ? 'rgba(0,212,124,0.1)' : 'rgba(0,120,70,0.12)'}
      />
      {sources.map((source) => {
        const isSelected = selectedSource === source.name
        const failCount = source.consecutiveFailures ?? 0
        const isCritical = failCount >= ALERT_THRESHOLD

        return (
          <Box
            key={source.name}
            px="sm"
            py="xs"
            onClick={() => onSelectSource(isSelected ? null : source.name)}
            style={{
              cursor: 'pointer',
              borderRadius: 4,
              background: isCritical
                ? isDark ? 'rgba(255,80,50,0.08)' : 'rgba(220,50,30,0.06)'
                : isSelected
                  ? isDark ? 'rgba(0,212,124,0.12)' : 'rgba(0,168,95,0.1)'
                  : 'transparent',
              transition: 'background 0.15s',
              outline: isCritical
                ? isDark ? '1px solid rgba(255,80,50,0.3)' : '1px solid rgba(220,50,30,0.25)'
                : 'none',
            }}
          >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Group gap="xs" align="flex-start" style={{ flex: 1, minWidth: 0 }}>
                <ThemeIcon
                  size="xs"
                  variant="transparent"
                  color={source.ok ? 'green' : (isCritical ? 'orange' : 'red')}
                  style={{ marginTop: 2, flexShrink: 0 }}
                >
                  {source.ok
                    ? <IconCircleCheck size={13} />
                    : isCritical
                      ? <IconAlertTriangle size={13} />
                      : <IconCircleX size={13} />
                  }
                </ThemeIcon>
                <Box style={{ minWidth: 0 }}>
                  <Text
                    size="xs"
                    fw={isSelected ? 600 : 400}
                    c={isSelected ? 'brand' : undefined}
                    style={{
                      lineHeight: 1.3,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {source.name}
                  </Text>
                  {source.error && (
                    <Tooltip label={source.error} multiline w={200} position="right">
                      <Text
                        size="xs"
                        c={isCritical ? 'orange' : 'red'}
                        style={{ fontSize: 10, cursor: 'help' }}
                      >
                        {isCritical ? `failing × ${failCount}` : 'fetch error'}
                      </Text>
                    </Tooltip>
                  )}
                </Box>
              </Group>

              <Group gap={6} align="center" style={{ flexShrink: 0 }}>
                {source.ok && (
                  <Badge size="xs" variant="outline" color="brand" radius="sm">
                    {source.itemCount}
                  </Badge>
                )}
                <Tooltip label="Open feed URL" position="right">
                  <Box
                    component="a"
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: 'inherit', opacity: 0.4, display: 'flex' }}
                  >
                    <IconExternalLink size={10} />
                  </Box>
                </Tooltip>
              </Group>
            </Group>
          </Box>
        )
      })}
    </>
  )
}

export function SourcesSidebar({ sources, selectedSource, onSelectSource }: SourcesSidebarProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'

  const newsFeeds = sources.filter((s) => !isThreatIntel(s))
  const threatIntelFeeds = sources.filter((s) => isThreatIntel(s))

  const totalItems = sources.reduce((acc, s) => acc + s.itemCount, 0)

  const criticalFeeds = sources.filter((s) => (s.consecutiveFailures ?? 0) >= ALERT_THRESHOLD)

  return (
    <Box
      style={{
        width: 280,
        flexShrink: 0,
        borderRight: isDark
          ? '1px solid rgba(0,212,124,0.12)'
          : '1px solid rgba(0,120,70,0.1)',
        height: '100%',
      }}
    >
      <Box
        px="md"
        py="sm"
        style={{
          borderBottom: isDark
            ? '1px solid rgba(0,212,124,0.1)'
            : '1px solid rgba(0,120,70,0.08)',
        }}
      >
        <Text size="xs" fw={700} ff="monospace" c="dimmed" style={{ letterSpacing: '0.1em' }}>
          SOURCES
        </Text>
      </Box>

      {criticalFeeds.length > 0 && (
        <Alert
          icon={<IconAlertTriangle size={13} />}
          color="orange"
          variant="light"
          p="xs"
          radius={0}
          styles={{
            root: {
              borderBottom: isDark ? '1px solid rgba(255,140,0,0.2)' : '1px solid rgba(200,100,0,0.15)',
              background: isDark ? 'rgba(255,100,0,0.1)' : 'rgba(255,140,0,0.08)',
            },
            message: { fontSize: 11 },
          }}
        >
          <Text size="xs" ff="monospace" fw={600} style={{ fontSize: 11, letterSpacing: '0.04em' }}>
            {criticalFeeds.length === 1
              ? `${criticalFeeds[0].name} has failed ${criticalFeeds[0].consecutiveFailures} times in a row`
              : `${criticalFeeds.length} feeds failing persistently`}
          </Text>
        </Alert>
      )}

      <ScrollArea h="calc(100vh - 120px)" scrollbarSize={4}>
        <Stack gap={0} p="xs">
          {/* "All" row */}
          <Box
            px="sm"
            py="xs"
            onClick={() => onSelectSource(null)}
            style={{
              cursor: 'pointer',
              borderRadius: 4,
              background: selectedSource === null
                ? isDark ? 'rgba(0,212,124,0.12)' : 'rgba(0,168,95,0.1)'
                : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            <Group justify="space-between" align="center">
              <Text
                size="sm"
                fw={selectedSource === null ? 600 : 400}
                c={selectedSource === null ? 'brand' : undefined}
              >
                All Sources
              </Text>
              <Badge size="xs" variant="filled" color="brand" radius="sm">
                {totalItems}
              </Badge>
            </Group>
          </Box>

          <SourceSection
            label="NEWS"
            sources={newsFeeds}
            selectedSource={selectedSource}
            onSelectSource={onSelectSource}
            isDark={isDark}
          />

          <SourceSection
            label="THREAT INTEL"
            sources={threatIntelFeeds}
            selectedSource={selectedSource}
            onSelectSource={onSelectSource}
            isDark={isDark}
          />
        </Stack>
      </ScrollArea>
    </Box>
  )
}
