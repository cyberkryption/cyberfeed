import {
  Stack, Text, Badge, Box, Tooltip, ScrollArea,
  ThemeIcon, Group, useComputedColorScheme
} from '@mantine/core'
import { IconCircleCheck, IconCircleX, IconExternalLink } from '@tabler/icons-react'
import type { FeedStatus } from '../types'

interface SourcesSidebarProps {
  sources: FeedStatus[]
  selectedSource: string | null
  onSelectSource: (source: string | null) => void
}

export function SourcesSidebar({ sources, selectedSource, onSelectSource }: SourcesSidebarProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'

  return (
    <Box
      style={{
        width: 320,
        flexShrink: 0,
        borderRight: isDark
          ? '1px solid rgba(0,212,124,0.12)'
          : '1px solid rgba(0,120,70,0.1)',
        height: '100%',
      }}
    >
      <Box px="md" py="sm" style={{ borderBottom: isDark ? '1px solid rgba(0,212,124,0.1)' : '1px solid rgba(0,120,70,0.08)' }}>
        <Text size="xs" fw={700} ff="monospace" c="dimmed" style={{ letterSpacing: '0.1em' }}>
          SOURCES
        </Text>
      </Box>
      <ScrollArea h="calc(100vh - 120px)" scrollbarSize={4}>
        <Stack gap={0} p="xs">
          {/* "All" option */}
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
              <Text size="sm" fw={selectedSource === null ? 600 : 400} c={selectedSource === null ? 'brand' : undefined}>
                All Sources
              </Text>
              <Badge size="xs" variant="filled" color="brand" radius="sm">
                {sources.reduce((acc, s) => acc + s.itemCount, 0)}
              </Badge>
            </Group>
          </Box>

          {sources.map((source) => (
            <Box
              key={source.name}
              px="sm"
              py="xs"
              onClick={() => onSelectSource(source.name === selectedSource ? null : source.name)}
              style={{
                cursor: 'pointer',
                borderRadius: 4,
                background: selectedSource === source.name
                  ? isDark ? 'rgba(0,212,124,0.12)' : 'rgba(0,168,95,0.1)'
                  : 'transparent',
                transition: 'background 0.15s',
                opacity: source.ok ? 1 : 0.6,
              }}
            >
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Group gap="xs" align="flex-start" style={{ flex: 1, minWidth: 0 }}>
                  <ThemeIcon
                    size="xs"
                    variant="transparent"
                    color={source.ok ? 'green' : 'red'}
                    style={{ marginTop: 2, flexShrink: 0 }}
                  >
                    {source.ok
                      ? <IconCircleCheck size={13} />
                      : <IconCircleX size={13} />
                    }
                  </ThemeIcon>
                  <Box style={{ minWidth: 0 }}>
                    <Text
                      size="xs"
                      fw={selectedSource === source.name ? 600 : 400}
                      c={selectedSource === source.name ? 'brand' : undefined}
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
                        <Text size="xs" c="red" style={{ fontSize: 10, cursor: 'help' }}>
                          fetch error
                        </Text>
                      </Tooltip>
                    )}
                  </Box>
                </Group>
                <Group gap={4} align="center" style={{ flexShrink: 0 }}>
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
          ))}
        </Stack>
      </ScrollArea>
    </Box>
  )
}
