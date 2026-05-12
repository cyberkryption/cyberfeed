import {
  Stack, Text, Badge, Box, Tooltip, ScrollArea,
  ThemeIcon, Group, Switch, useComputedColorScheme
} from '@mantine/core'
import { IconCircleCheck, IconCircleX, IconExternalLink } from '@tabler/icons-react'
import type { FeedStatus } from '../types'

interface SourcesSidebarProps {
  sources: FeedStatus[]
  selectedSource: string | null
  onSelectSource: (source: string | null) => void
  disabledSources: Set<string>
  onToggleSource: (name: string) => void
}

export function SourcesSidebar({
  sources, selectedSource, onSelectSource, disabledSources, onToggleSource,
}: SourcesSidebarProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'

  const enabledTotal = sources
    .filter((s) => !disabledSources.has(s.name))
    .reduce((acc, s) => acc + s.itemCount, 0)

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
      <Box
        px="md"
        py="sm"
        style={{
          borderBottom: isDark
            ? '1px solid rgba(0,212,124,0.1)'
            : '1px solid rgba(0,120,70,0.08)',
        }}
      >
        <Group justify="space-between" align="center">
          <Text size="xs" fw={700} ff="monospace" c="dimmed" style={{ letterSpacing: '0.1em' }}>
            SOURCES
          </Text>
          {disabledSources.size > 0 && (
            <Tooltip label="Re-enable all sources" position="right" withArrow>
              <Text
                size="xs"
                ff="monospace"
                style={{
                  color: isDark ? 'rgba(0,212,124,0.6)' : 'rgba(0,120,70,0.7)',
                  cursor: 'pointer',
                  letterSpacing: '0.06em',
                  fontSize: 10,
                }}
                onClick={() => sources.forEach((s) => {
                  if (disabledSources.has(s.name)) onToggleSource(s.name)
                })}
              >
                RESET
              </Text>
            </Tooltip>
          )}
        </Group>
      </Box>

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
                {enabledTotal}
              </Badge>
            </Group>
          </Box>

          {sources.map((source) => {
            const isDisabled = disabledSources.has(source.name)
            const isSelected = selectedSource === source.name

            return (
              <Box
                key={source.name}
                px="sm"
                py="xs"
                onClick={() => {
                  if (!isDisabled) onSelectSource(isSelected ? null : source.name)
                }}
                style={{
                  cursor: isDisabled ? 'default' : 'pointer',
                  borderRadius: 4,
                  background: isSelected && !isDisabled
                    ? isDark ? 'rgba(0,212,124,0.12)' : 'rgba(0,168,95,0.1)'
                    : 'transparent',
                  transition: 'background 0.15s, opacity 0.2s',
                  opacity: isDisabled ? 0.38 : (source.ok ? 1 : 0.6),
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
                        fw={isSelected && !isDisabled ? 600 : 400}
                        c={isSelected && !isDisabled ? 'brand' : undefined}
                        style={{
                          lineHeight: 1.3,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          textDecoration: isDisabled ? 'line-through' : 'none',
                        }}
                      >
                        {source.name}
                      </Text>
                      {source.error && !isDisabled && (
                        <Tooltip label={source.error} multiline w={200} position="right">
                          <Text size="xs" c="red" style={{ fontSize: 10, cursor: 'help' }}>
                            fetch error
                          </Text>
                        </Tooltip>
                      )}
                    </Box>
                  </Group>

                  <Group gap={6} align="center" style={{ flexShrink: 0 }}>
                    {source.ok && !isDisabled && (
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
                    <Switch
                      size="xs"
                      checked={!isDisabled}
                      onChange={() => onToggleSource(source.name)}
                      onClick={(e) => e.stopPropagation()}
                      color="brand"
                      aria-label={isDisabled ? `Enable ${source.name}` : `Disable ${source.name}`}
                      styles={{ track: { cursor: 'pointer' } }}
                    />
                  </Group>
                </Group>
              </Box>
            )
          })}
        </Stack>
      </ScrollArea>
    </Box>
  )
}
