import { useComputedColorScheme, Box, Text } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import type { FeedItem } from '../types'

interface TickerBarProps {
  items: FeedItem[]
}

export function TickerBar({ items }: TickerBarProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'

  if (items.length === 0) return null

  // Duplicate so the second copy fills the gap when the first scrolls off.
  const doubled = [...items, ...items]

  // ~3s per item gives comfortable reading speed; minimum 20s for short lists.
  const durationS = Math.max(20, items.length * 3)

  const red = isDark ? '#ff8787' : '#c92a2a'
  const redDim = isDark ? 'rgba(255,135,135,0.3)' : 'rgba(200,30,30,0.22)'

  return (
    <Box
      style={{
        width: '100%',
        height: 34,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'stretch',
        overflow: 'hidden',
        background: isDark ? 'rgba(200,0,0,0.1)' : 'rgba(200,30,30,0.05)',
        borderBottom: `1px solid ${isDark ? 'rgba(220,50,50,0.22)' : 'rgba(200,30,30,0.15)'}`,
      }}
    >
      {/* Static label */}
      <Box
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 14px',
          background: isDark ? 'rgba(200,0,0,0.22)' : 'rgba(200,30,30,0.1)',
          borderRight: `1px solid ${isDark ? 'rgba(220,50,50,0.28)' : 'rgba(200,30,30,0.18)'}`,
        }}
      >
        <IconAlertTriangle size={12} color="#e03131" />
        <Text
          size="xs"
          fw={700}
          ff="monospace"
          style={{ color: '#e03131', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}
        >
          CRITICAL CVEs
        </Text>
      </Box>

      {/* Scrolling track */}
      <Box style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
        <Box
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            animation: `ticker-scroll ${durationS}s linear infinite`,
            willChange: 'transform',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.animationPlayState = 'paused'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.animationPlayState = 'running'
          }}
        >
          {doubled.map((item, i) => (
            <span key={`${item.link}-${i}`} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <Text
                component="a"
                href={item.link || '#'}
                target="_blank"
                rel="noopener noreferrer"
                size="xs"
                ff="monospace"
                style={{ color: red, textDecoration: 'none', padding: '0 12px', whiteSpace: 'nowrap' }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement
                  el.style.textDecoration = 'underline'
                  el.style.color = isDark ? '#ffa8a8' : '#a61e1e'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement
                  el.style.textDecoration = 'none'
                  el.style.color = red
                }}
              >
                {item.title}
              </Text>
              <span style={{ color: redDim, fontSize: 9, userSelect: 'none' }}>◆</span>
            </span>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
