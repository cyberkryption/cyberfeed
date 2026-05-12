import {
  Group, TextInput, SegmentedControl, Text, ActionIcon,
  Popover, Checkbox, Divider, useComputedColorScheme,
} from '@mantine/core'
import { IconSearch, IconChartBar } from '@tabler/icons-react'
import { ALL_CHARTS } from '../charts'

interface ToolbarProps {
  search: string
  onSearchChange: (v: string) => void
  sortBy: 'date' | 'source'
  onSortChange: (v: 'date' | 'source') => void
  visibleCount: number
  totalCount: number
  visibleCharts: Set<string>
  onToggleChart: (id: string) => void
}

export function Toolbar({
  search, onSearchChange, sortBy, onSortChange,
  visibleCount, totalCount, visibleCharts, onToggleChart,
}: ToolbarProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'
  const activeCount = visibleCharts.size

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

        <Popover width={210} position="bottom-end" withArrow shadow="md" withinPortal>
          <Popover.Target>
            <ActionIcon
              variant={activeCount > 0 ? 'filled' : 'subtle'}
              color="brand"
              size="sm"
              aria-label="Configure visible charts"
              title={activeCount > 0 ? `${activeCount} charts visible` : 'All charts hidden'}
            >
              <IconChartBar size={15} />
            </ActionIcon>
          </Popover.Target>

          <Popover.Dropdown p="sm">
            <Text size="xs" ff="monospace" fw={700} mb="xs"
              style={{ letterSpacing: '0.1em', color: isDark ? '#00d47c' : '#007840' }}>
              CHARTS
            </Text>

            <Text size="xs" c="dimmed" ff="monospace" mb={6}
              style={{ letterSpacing: '0.08em', fontSize: 10 }}>
              CVE HIGH &amp; CRITICAL
            </Text>
            {ALL_CHARTS.filter((c) => c.section === 'CVE').map((c) => (
              <Checkbox
                key={c.id}
                label={c.label}
                checked={visibleCharts.has(c.id)}
                onChange={() => onToggleChart(c.id)}
                size="xs"
                mb={6}
                color="brand"
                styles={{ label: { fontSize: 12 } }}
              />
            ))}

            <Divider my="xs" />

            <Text size="xs" c="dimmed" ff="monospace" mb={6}
              style={{ letterSpacing: '0.08em', fontSize: 10 }}>
              GENERAL
            </Text>
            {ALL_CHARTS.filter((c) => c.section === 'General').map((c) => (
              <Checkbox
                key={c.id}
                label={c.label}
                checked={visibleCharts.has(c.id)}
                onChange={() => onToggleChart(c.id)}
                size="xs"
                mb={6}
                color="brand"
                styles={{ label: { fontSize: 12 } }}
              />
            ))}
          </Popover.Dropdown>
        </Popover>
      </Group>
    </Group>
  )
}
