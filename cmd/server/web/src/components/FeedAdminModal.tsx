import { useEffect, useState } from 'react'
import {
  Modal, Stack, Group, Text, Switch, ActionIcon, Box,
  TextInput, Button, Loader, Alert, Tooltip, Divider,
  ScrollArea, Badge,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { useComputedColorScheme } from '@mantine/core'
import { IconTrash, IconAlertTriangle, IconPlus, IconRefresh } from '@tabler/icons-react'
import { useFeedAdmin } from '../hooks/useFeedAdmin'

interface FeedAdminModalProps {
  opened: boolean
  onClose: () => void
  onRefresh: () => void
}

export function FeedAdminModal({ opened, onClose, onRefresh }: FeedAdminModalProps) {
  const { feeds, loading, error, load, addFeed, deleteFeed, toggleFeed } = useFeedAdmin()
  const computedColorScheme = useComputedColorScheme('dark')
  const isDark = computedColorScheme === 'dark'

  const [newName, setNewName] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // Track which feed is in "pending delete" state (first click turns red)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  useEffect(() => {
    if (opened) {
      load()
      setPendingDelete(null)
      setNewName('')
      setNewUrl('')
      setAddError(null)
    }
  }, [opened, load])

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      await toggleFeed(name, enabled)
      notifications.show({
        message: `Feed "${name}" ${enabled ? 'enabled' : 'disabled'}`,
        color: 'brand',
      })
    } catch (e) {
      notifications.show({
        title: 'Error',
        message: String(e),
        color: 'red',
      })
    }
  }

  const handleDelete = async (name: string) => {
    if (pendingDelete !== name) {
      // First click: arm the delete
      setPendingDelete(name)
      return
    }
    // Second click: confirm delete
    setPendingDelete(null)
    try {
      await deleteFeed(name)
      notifications.show({
        message: `Feed "${name}" deleted`,
        color: 'orange',
      })
    } catch (e) {
      notifications.show({
        title: 'Error',
        message: String(e),
        color: 'red',
      })
    }
  }

  const handleAdd = async () => {
    const name = newName.trim()
    const url = newUrl.trim()
    setAddError(null)

    if (!name) {
      setAddError('Name is required')
      return
    }
    if (!url) {
      setAddError('URL is required')
      return
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setAddError('URL must start with http:// or https://')
      return
    }

    setAdding(true)
    try {
      await addFeed(name, url)
      setNewName('')
      setNewUrl('')
      notifications.show({
        message: `Feed "${name}" added`,
        color: 'brand',
      })
    } catch (e) {
      setAddError(String(e))
    } finally {
      setAdding(false)
    }
  }

  const handleRefresh = () => {
    onRefresh()
    notifications.show({
      message: 'Feed refresh triggered',
      color: 'brand',
    })
  }

  const brandColor = isDark ? '#00d47c' : '#007840'
  const dimColor = isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text ff="monospace" fw={700} size="sm" style={{ letterSpacing: '0.08em', color: brandColor }}>
          MANAGE FEEDS
        </Text>
      }
      size="lg"
      styles={{
        header: {
          borderBottom: isDark
            ? '1px solid rgba(0,212,124,0.2)'
            : '1px solid rgba(0,120,70,0.15)',
          paddingBottom: 12,
        },
        body: { padding: 0 },
      }}
    >
      {/* Feed list */}
      <ScrollArea h={380} px="md" py="sm">
        {loading && (
          <Group justify="center" py="xl">
            <Loader size="sm" color="brand" type="dots" />
            <Text ff="monospace" size="xs" c="dimmed" style={{ letterSpacing: '0.08em' }}>
              LOADING FEEDS…
            </Text>
          </Group>
        )}

        {error && !loading && (
          <Alert icon={<IconAlertTriangle size={16} />} color="red" mb="md">
            {error}
          </Alert>
        )}

        {!loading && feeds.length === 0 && !error && (
          <Text ff="monospace" size="xs" c="dimmed" ta="center" py="xl" style={{ letterSpacing: '0.08em' }}>
            NO FEEDS CONFIGURED
          </Text>
        )}

        <Stack gap={6}>
          {feeds.map((feed) => (
            <Box
              key={feed.name}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                border: isDark
                  ? '1px solid rgba(0,212,124,0.1)'
                  : '1px solid rgba(0,120,70,0.1)',
                background: isDark
                  ? 'rgba(0,212,124,0.04)'
                  : 'rgba(0,120,70,0.03)',
              }}
            >
              <Group justify="space-between" align="center" wrap="nowrap">
                {/* Status dot + name */}
                <Group gap={8} align="center" style={{ flex: 1, minWidth: 0 }}>
                  <Box
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: feed.enabled
                        ? (isDark ? '#00d47c' : '#007840')
                        : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'),
                      boxShadow: feed.enabled
                        ? (isDark ? '0 0 6px rgba(0,212,124,0.7)' : '0 0 4px rgba(0,120,70,0.5)')
                        : 'none',
                    }}
                  />
                  <Box style={{ minWidth: 0, flex: 1 }}>
                    <Text ff="monospace" fw={600} size="xs" style={{ letterSpacing: '0.04em' }} truncate>
                      {feed.name}
                    </Text>
                    <Text
                      component="a"
                      href={feed.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      size="xs"
                      style={{ color: dimColor, textDecoration: 'none', display: 'block' }}
                      truncate
                    >
                      {feed.url}
                    </Text>
                  </Box>
                </Group>

                {/* Controls */}
                <Group gap={6} align="center" style={{ flexShrink: 0 }}>
                  <Tooltip
                    label={
                      feed.enabled
                        ? 'Fetched on refresh — click to disable'
                        : 'Not fetched on refresh — click to enable'
                    }
                    position="top"
                    withArrow
                  >
                    <Box>
                      <Switch
                        size="xs"
                        checked={feed.enabled}
                        onChange={(e) => handleToggle(feed.name, e.currentTarget.checked)}
                        color="brand"
                        label={
                          <Text ff="monospace" size="xs" style={{ letterSpacing: '0.06em', color: dimColor }}>
                            FETCHED
                          </Text>
                        }
                        styles={{
                          label: { paddingLeft: 6 },
                          track: { cursor: 'pointer' },
                        }}
                      />
                    </Box>
                  </Tooltip>

                  <Tooltip
                    label={pendingDelete === feed.name ? 'Click again to confirm delete' : 'Delete feed'}
                    position="top"
                    withArrow
                  >
                    <ActionIcon
                      variant={pendingDelete === feed.name ? 'filled' : 'subtle'}
                      color={pendingDelete === feed.name ? 'red' : 'gray'}
                      size="sm"
                      onClick={() => handleDelete(feed.name)}
                      aria-label={`Delete ${feed.name}`}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Box>
          ))}
        </Stack>
      </ScrollArea>

      <Divider
        style={{
          borderColor: isDark ? 'rgba(0,212,124,0.15)' : 'rgba(0,120,70,0.12)',
        }}
      />

      {/* Add feed section */}
      <Box px="md" py="sm">
        <Text ff="monospace" size="xs" fw={600} mb={8} style={{ letterSpacing: '0.08em', color: brandColor }}>
          ADD FEED
        </Text>

        {addError && (
          <Alert icon={<IconAlertTriangle size={14} />} color="red" mb={8} py={6}>
            <Text size="xs">{addError}</Text>
          </Alert>
        )}

        <Group gap={8} align="flex-start">
          <TextInput
            placeholder="Feed name"
            value={newName}
            onChange={(e) => setNewName(e.currentTarget.value)}
            size="xs"
            style={{ flex: '0 0 160px' }}
            styles={{
              input: { fontFamily: 'monospace', fontSize: 11 },
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <TextInput
            placeholder="https://example.com/feed.xml"
            value={newUrl}
            onChange={(e) => setNewUrl(e.currentTarget.value)}
            size="xs"
            style={{ flex: 1, minWidth: 0 }}
            styles={{
              input: { fontFamily: 'monospace', fontSize: 11 },
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button
            size="xs"
            color="brand"
            variant="filled"
            leftSection={<IconPlus size={13} />}
            onClick={handleAdd}
            loading={adding}
            styles={{
              label: { fontFamily: 'monospace', letterSpacing: '0.06em', fontSize: 11 },
            }}
          >
            ADD
          </Button>
        </Group>
      </Box>

      <Divider
        style={{
          borderColor: isDark ? 'rgba(0,212,124,0.15)' : 'rgba(0,120,70,0.12)',
        }}
      />

      {/* Footer */}
      <Group justify="space-between" align="center" px="md" py="sm">
        <Group gap={6} align="center">
          <Badge
            variant="outline"
            color="brand"
            size="xs"
            ff="monospace"
            style={{ letterSpacing: '0.04em' }}
          >
            {feeds.length} FEEDS
          </Badge>
          <Badge
            variant="outline"
            color="green"
            size="xs"
            ff="monospace"
            style={{ letterSpacing: '0.04em' }}
          >
            {feeds.filter((f) => f.enabled).length} ENABLED
          </Badge>
        </Group>
        <Group gap={6}>
          <Tooltip label="Trigger an immediate feed refresh" position="top" withArrow>
            <Button
              size="xs"
              variant="subtle"
              color="brand"
              leftSection={<IconRefresh size={13} />}
              onClick={handleRefresh}
              styles={{
                label: { fontFamily: 'monospace', letterSpacing: '0.06em', fontSize: 11 },
              }}
            >
              REFRESH FEEDS
            </Button>
          </Tooltip>
          <Button
            size="xs"
            variant="outline"
            color="gray"
            onClick={onClose}
            styles={{
              label: { fontFamily: 'monospace', letterSpacing: '0.06em', fontSize: 11 },
            }}
          >
            CLOSE
          </Button>
        </Group>
      </Group>
    </Modal>
  )
}
