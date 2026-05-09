import { Group, TextInput, SegmentedControl, Text, ActionIcon, Tooltip, useComputedColorScheme } from '@mantine/core'
import { IconSearch, IconChartBar } from '@tabler/icons-react'

interface ToolbarProps {
  search: string
  onSearchChange: (v: string) => void
  sortBy: 'date' | 'source'
  onSortChange: (v: 'date' | 'source') => void
  visibleCount: number
  totalCount: number
  showStats: boolean
  onToggleStats: () => void
}

export function Toolbar({
  search, onSearchChange, sortBy, onSortChange, visibleCount, totalCount, showStats, onToggleStats
}: ToolbarProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'

  return (
    <Group
      justify="space-between"
      align="center"
      px="xl"
      py="sm"
      style={{
        borderBottom: isDark
          ? '1px solid rgba(0,212,124,0.1)'
          : '1px solid rgba(0,120,70,0.08)',
        background: isDark
          ? 'rgba(20, 21, 23, 0.6)'
          : 'rgba(245, 250, 247, 0.7)',
        backdropFilter: 'blur(8px)',
        flexShrink: 0,
      }}
    >
      <TextInput
        placeholder="Search titles, descriptions…"
        value={search}
        onChange={(e) => onSearchChange(e.currentTarget.value)}
        leftSection={<IconSearch size={14} />}
        size="sm"
        style={{ width: 320 }}
        styles={{
          input: {
            fontFamily: '"IBM Plex Sans", sans-serif',
            fontSize: '0.85rem',
            background: isDark ? 'rgba(30,32,36,0.8)' : undefined,
            border: isDark ? '1px solid rgba(0,212,124,0.15)' : undefined,
          }
        }}
      />

      <Group gap="md" align="center">
        <Text size="xs" c="dimmed" ff="monospace">
          {visibleCount} / {totalCount} items
        </Text>
        <SegmentedControl
          size="xs"
          value={sortBy}
          onChange={(v) => onSortChange(v as 'date' | 'source')}
          data={[
            { label: 'DATE', value: 'date' },
            { label: 'SOURCE', value: 'source' },
          ]}
          styles={{
            root: { fontFamily: '"Space Mono", monospace' },
            label: { fontSize: 11, letterSpacing: '0.06em' },
          }}
        />
        <Tooltip label={showStats ? 'Hide stats' : 'Show stats'} withArrow>
          <ActionIcon
            variant={showStats ? 'filled' : 'subtle'}
            color="brand"
            size="sm"
            onClick={onToggleStats}
            aria-label="Toggle stats panel"
          >
            <IconChartBar size={15} />
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  )
}
