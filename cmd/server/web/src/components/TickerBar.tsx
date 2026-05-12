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

  // ~9s per item; minimum 60s for short lists.
  const durationS = Math.max(60, items.length * 9)

  const bg      = isDark ? '#00d47c' : '#00a85f'
  const bgLabel = isDark ? '#00b568' : '#008f50'
  const border  = isDark ? '#009e5c' : '#007840'
  const text    = '#000000'
  const textDim = 'rgba(0,0,0,0.35)'

  return (
    <Box
      style={{
        width: '100%',
        height: 48,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'stretch',
        overflow: 'hidden',
        background: bg,
        borderBottom: `1px solid ${border}`,
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
          background: bgLabel,
          borderRight: `1px solid ${border}`,
        }}
      >
        <IconAlertTriangle size={16} color={text} />
        <Text
          size="sm"
          fw={700}
          ff="monospace"
          style={{ color: text, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}
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
                size="sm"
                ff="monospace"
                style={{ color: text, textDecoration: 'none', padding: '0 16px', whiteSpace: 'nowrap' }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement
                  el.style.textDecoration = 'underline'
                  el.style.opacity = '0.75'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement
                  el.style.textDecoration = 'none'
                  el.style.opacity = '1'
                }}
              >
                {item.title}
              </Text>
              <span style={{ color: textDim, fontSize: 11, userSelect: 'none' }}>◆</span>
            </span>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
