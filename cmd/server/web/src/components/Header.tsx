import {
  Group, Text, ActionIcon, useMantineColorScheme,
  useComputedColorScheme, Badge, Tooltip, Box
} from '@mantine/core'
import { IconSun, IconMoon, IconRefresh, IconShieldCheck } from '@tabler/icons-react'

interface HeaderProps {
  onRefresh: () => void
  loading: boolean
  lastRefreshed: Date | null
  totalItems: number
  activeSources: number
}

export function Header({ onRefresh, loading, lastRefreshed, totalItems, activeSources }: HeaderProps) {
  const { setColorScheme } = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme('dark')

  const isDark = computedColorScheme === 'dark'

  const fmtTime = (d: Date | null) => {
    if (!d) return 'never'
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <Box
      component="header"
      style={{
        borderBottom: isDark
          ? '1px solid rgba(0,212,124,0.2)'
          : '1px solid rgba(0,120,70,0.15)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: isDark
          ? 'rgba(16, 17, 19, 0.92)'
          : 'rgba(248, 252, 250, 0.92)',
      }}
    >
      <Group
        justify="space-between"
        align="center"
        px="xl"
        py="sm"
        style={{ maxWidth: 1400, margin: '0 auto', width: '100%' }}
      >
        {/* Logo */}
        <Group gap="sm" align="center">
          <Box
            style={{
              background: 'linear-gradient(135deg, #00d47c, #00a85f)',
              borderRadius: 6,
              padding: '5px 7px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <IconShieldCheck size={20} color="white" stroke={2} />
          </Box>
          <Box>
            <Text
              ff="monospace"
              fw={700}
              size="lg"
              style={{
                letterSpacing: '-0.02em',
                color: isDark ? '#00d47c' : '#007840',
                lineHeight: 1.1,
              }}
            >
              CYBERFEED
            </Text>
            <Text size="xs" c="dimmed" ff="monospace" style={{ letterSpacing: '0.08em' }}>
              SECURITY INTELLIGENCE
            </Text>
          </Box>
        </Group>

        {/* Stats */}
        <Group gap="md" visibleFrom="sm">
          <Badge
            variant="light"
            color="brand"
            size="sm"
            ff="monospace"
            style={{ letterSpacing: '0.05em' }}
          >
            {totalItems} ITEMS
          </Badge>
          <Badge
            variant="outline"
            color={activeSources > 0 ? 'green' : 'red'}
            size="sm"
            ff="monospace"
            style={{ letterSpacing: '0.05em' }}
          >
            {activeSources} SOURCES ONLINE
          </Badge>
          {lastRefreshed && (
            <Text size="xs" c="dimmed" ff="monospace">
              REFRESHED {fmtTime(lastRefreshed)}
            </Text>
          )}
        </Group>

        {/* Actions */}
        <Group gap="xs">
          <Tooltip label="Refresh feeds" position="bottom">
            <ActionIcon
              variant="subtle"
              color="brand"
              size="lg"
              onClick={onRefresh}
              loading={loading}
              aria-label="Refresh feeds"
            >
              <IconRefresh size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} position="bottom">
            <ActionIcon
              variant="subtle"
              color={isDark ? 'yellow' : 'dark'}
              size="lg"
              onClick={() => setColorScheme(isDark ? 'light' : 'dark')}
              aria-label="Toggle color scheme"
            >
              {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </Box>
  )
}
