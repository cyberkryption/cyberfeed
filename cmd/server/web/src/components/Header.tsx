import { useState, useEffect, useRef } from 'react'
import {
  Group, Text, Switch, useMantineColorScheme,
  useComputedColorScheme, Badge, Tooltip, ActionIcon, Box, Slider
} from '@mantine/core'
import { useInterval } from '@mantine/hooks'
import { IconSun, IconMoon, IconRefresh, IconRadar, IconLogout, IconSettings } from '@tabler/icons-react'

const REFRESH_INTERVAL_S = 20 * 60

interface HeaderProps {
  onRefresh: () => void
  loading: boolean
  lastRefreshed: Date | null
  totalItems: number
  activeSources: number
  serverUpdatedAt: string | null
  tickerSpeed: number
  onTickerSpeedChange: (v: number) => void
  username: string | null
  onLogout: () => void
  onManageFeeds: () => void
}

export function Header({
  onRefresh, loading, lastRefreshed, totalItems, activeSources, serverUpdatedAt,
  tickerSpeed, onTickerSpeedChange, username, onLogout, onManageFeeds,
}: HeaderProps) {
  const { setColorScheme } = useMantineColorScheme()
  const computedColorScheme = useComputedColorScheme('dark')
  const isDark = computedColorScheme === 'dark'

  // ── Countdown ────────────────────────────────────────────────────────────
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

  // ── Refresh progress bar ─────────────────────────────────────────────────
  // Simulates progress: crawls to ~85 % while loading, snaps to 100 % on done.
  const [barPct, setBarPct] = useState(0)
  const [barVisible, setBarVisible] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (loading) {
      // Reset and start crawl
      if (tickRef.current) clearInterval(tickRef.current)
      setBarPct(0)
      setBarVisible(true)
      let pct = 0
      tickRef.current = setInterval(() => {
        // Decelerate as it approaches 85 % so it never quite reaches it
        const step = Math.max(0.3, (85 - pct) * 0.06)
        pct = Math.min(85, pct + step)
        setBarPct(pct)
        if (pct >= 85) clearInterval(tickRef.current!)
      }, 120)
    } else {
      // Complete and fade out
      if (tickRef.current) clearInterval(tickRef.current)
      if (barVisible) {
        setBarPct(100)
        setTimeout(() => {
          setBarVisible(false)
          setBarPct(0)
        }, 500)
      }
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

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
        style={{ width: '100%' }}
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
            <IconRadar size={20} color="white" stroke={2} />
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
              CYBERFEED 0.1v
            </Text>
            <Text size="xs" c="dimmed" ff="monospace" style={{ letterSpacing: '0.08em' }}>
              CYBER SECURITY INTELLIGENCE
            </Text>
          </Box>
        </Group>

        {/* Stats + countdown */}
        <Group gap="md" visibleFrom="sm">
          <Badge variant="light" color="brand" size="sm" ff="monospace" style={{ letterSpacing: '0.05em' }}>
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
              style={{ color: isDark ? 'rgba(0,212,124,0.6)' : 'rgba(0,120,70,0.7)', letterSpacing: '0.05em' }}
            >
              {countdown}
            </Text>
          )}

          {/* Ticker speed slider */}
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Text size="xs" ff="monospace" c="dimmed" style={{ letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              TICKER
            </Text>
            <Tooltip label={`Ticker speed: ${tickerSpeed}%`} position="bottom" withArrow>
              <Slider
                value={tickerSpeed}
                onChange={onTickerSpeedChange}
                min={50}
                max={100}
                step={5}
                w={80}
                size="xs"
                color="brand"
                label={null}
                styles={{
                  thumb: { borderColor: isDark ? '#00d47c' : '#007840', width: 12, height: 12 },
                  track: { cursor: 'pointer' },
                }}
              />
            </Tooltip>
          </Box>
        </Group>

        {/* Actions: progress bar + refresh button + theme toggle */}
        <Group gap="sm" align="center">

          {/* Progress bar — always reserves space; visible only while refreshing */}
          <Box
            style={{
              width: 160,
              height: 28,
              borderRadius: 6,
              overflow: 'hidden',
              border: barVisible
                ? `1px solid ${isDark ? 'rgba(0,212,124,0.35)' : 'rgba(0,120,70,0.3)'}`
                : '1px solid transparent',
              background: barVisible
                ? (isDark ? 'rgba(0,212,124,0.08)' : 'rgba(0,168,95,0.07)')
                : 'transparent',
              transition: 'border-color 0.2s, background 0.2s',
              display: 'flex',
              alignItems: 'center',
              padding: '0 6px',
              gap: 6,
            }}
          >
            {barVisible && (
              <>
                <Box
                  style={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    background: isDark ? 'rgba(0,212,124,0.15)' : 'rgba(0,168,95,0.12)',
                    overflow: 'hidden',
                  }}
                >
                  <Box
                    style={{
                      height: '100%',
                      width: `${barPct}%`,
                      borderRadius: 3,
                      background: isDark
                        ? 'linear-gradient(90deg, #00d47c, #00ff9d)'
                        : 'linear-gradient(90deg, #00a85f, #00d47c)',
                      transition: barPct === 100 ? 'width 0.3s ease-out' : 'width 0.12s linear',
                      boxShadow: isDark ? '0 0 6px rgba(0,212,124,0.6)' : '0 0 4px rgba(0,168,95,0.5)',
                    }}
                  />
                </Box>
                <Text
                  size="xs"
                  ff="monospace"
                  style={{
                    color: isDark ? 'rgba(0,212,124,0.8)' : 'rgba(0,120,70,0.8)',
                    minWidth: 32,
                    textAlign: 'right',
                    letterSpacing: '0.03em',
                  }}
                >
                  {Math.round(barPct)}%
                </Text>
              </>
            )}
          </Box>

          <Tooltip label="Manage feeds" position="bottom">
            <ActionIcon
              variant="subtle"
              color="brand"
              size="lg"
              onClick={onManageFeeds}
              aria-label="Manage feeds"
            >
              <IconSettings size={18} />
            </ActionIcon>
          </Tooltip>

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

          {username && (
            <Tooltip label={`Sign out (${username})`} position="bottom">
              <ActionIcon
                variant="subtle"
                color="gray"
                size="lg"
                onClick={onLogout}
                aria-label="Sign out"
              >
                <IconLogout size={18} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </Group>
    </Box>
  )
}
