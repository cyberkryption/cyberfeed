import { useState } from 'react'
import {
  Group, Text, Switch, useMantineColorScheme,
  useComputedColorScheme, Badge, Tooltip, ActionIcon, Box
} from '@mantine/core'
import { useInterval } from '@mantine/hooks'
import { IconSun, IconMoon, IconRefresh, IconShieldCheck } from '@tabler/icons-react'

const REFRESH_INTERVAL_S = 20 * 60

interface HeaderProps {
  onRefresh: () => void
  loading: boolean
  lastRefreshed: Date | null
  totalItems: number
  activeSources: number
  serverUpdatedAt: string | null
}

export function Header({
  onRefresh, loading, lastRefreshed, totalItems, activeSources, serverUpdatedAt
}: HeaderProps) {
  const { setColorScheme } = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme('dark')
  const isDark = computedColorScheme === 'dark'

  const [now, setNow] = useState(() => Date.now())
  useInterval(() => setNow(Date.now()), 1000)

  const fmtTime = (d: Date | null) => {
    if (!d) return 'never'
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  const countdown = (() => {
    if (!serverUpdatedAt) return null
    const elapsed = Math.floor((now - new Date(serverUpdatedAt).getTime()) / 1000)
    const remaining = REFRESH_INTERVAL_S - elapsed
    if (remaining <= 0) return 'REFRESHING…'
    const m = Math.floor(remaining / 60)
    const s = remaining % 60
    return `NEXT REFRESH ${m}:${s.toString().padStart(2, '0')}`
  })()

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

        {/* Stats + countdown */}
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
          {countdown && (
            <Text
              size="xs"
              ff="monospace"
              style={{
                color: isDark ? 'rgba(0,212,124,0.6)' : 'rgba(0,120,70,0.7)',
                letterSpacing: '0.05em',
              }}
            >
              {countdown}
            </Text>
          )}
        </Group>

        {/* Actions */}
        <Group gap="sm" align="center">
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
            <Switch
              checked={!isDark}
              onChange={() => setColorScheme(isDark ? 'light' : 'dark')}
              size="md"
              onLabel={<IconSun size={13} color="#f59f00" />}
              offLabel={<IconMoon size={13} color="#74c0fc" />}
              aria-label="Toggle color scheme"
              styles={{
                track: {
                  cursor: 'pointer',
                  backgroundColor: isDark ? 'rgba(0,212,124,0.15)' : undefined,
                  borderColor: isDark ? 'rgba(0,212,124,0.3)' : undefined,
                },
              }}
            />
          </Tooltip>
        </Group>
      </Group>
    </Box>
  )
}
