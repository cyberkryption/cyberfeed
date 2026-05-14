import { useEffect, useState } from 'react'
import {
  Modal, Stack, Group, Text, Box, TextInput, Button, Switch,
  ActionIcon, Tooltip, Loader, Alert, Badge, ScrollArea,
  useComputedColorScheme, Divider,
} from '@mantine/core'
import { IconTrash, IconPlus, IconAlertTriangle, IconRefresh } from '@tabler/icons-react'
import { useFeedAdmin } from '../hooks/useFeedAdmin'

interface FeedAdminModalProps {
  opened: boolean
  onClose: () => void
  onRefresh: () => void
}

export function FeedAdminModal({ opened, onClose, onRefresh }: FeedAdminModalProps) {
  const isDark = useComputedColorScheme('dark') === 'dark'
  const { feeds, loading, error, load, addFeed, deleteFeed, toggleFeed } = useFeedAdmin()

  const [newName, setNewName] = useState('')
  const [newURL, setNewURL] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    if (opened) {
      load()
      setConfirmDelete(null)
      setAddError(null)
      setNewName('')
      setNewURL('')
    }
  }, [opened, load])

  const handleAdd = async () => {
    const name = newName.trim()
    const url = newURL.trim()
    if (!name || !url) {
      setAddError('Name and URL are required.')
      return
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      setAddError('URL must start with http:// or https://')
      return
    }
    setAddError(null)
    setAddLoading(true)
    try {
      await addFeed(name, url)
      setNewName('')
      setNewURL('')
    } catch (e) {
      setAddError(String(e))
    } finally {
      setAddLoading(false)
    }
  }

  const handleDelete = async (name: string) => {
    if (confirmDelete !== name) {
      setConfirmDelete(name)
      return
    }
    setConfirmDelete(null)
    try {
      await deleteFeed(name)
    } catch {
      // list re-loads on success; stays unchanged on failure
    }
  }

  const handleToggle = async (name: string, enabled: boolean) => {
    try {
      await toggleFeed(name, enabled)
    } catch {
      // best-effort
    }
  }

  const handleSaveAndRefresh = () => {
    onClose()
    onRefresh()
  }

  const labelColor = isDark ? 'rgba(0,212,124,0.55)' : 'rgba(0,120,70,0.6)'

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text ff="monospace" fw={700} size="sm" style={{ letterSpacing: '0.1em', color: isDark ? '#00d47c' : '#007840' }}>
          MANAGE FEEDS
        </Text>
      }
      size="lg"
      styles={{
        content: {
          background: isDark ? '#13181b' : '#f5faf7',
          border: isDark ? '1px solid rgba(0,212,124,0.15)' : '1px solid rgba(0,120,70,0.12)',
        },
        header: {
          background: isDark ? '#13181b' : '#f5faf7',
          borderBottom: isDark ? '1px solid rgba(0,212,124,0.1)' : '1px solid rgba(0,120,70,0.08)',
        },
      }}
    >
      <Stack gap="sm">
        {error && (
          <Alert icon={<IconAlertTriangle size={14} />} color="red" p="xs">
            <Text size="xs">{error}</Text>
          </Alert>
        )}

        {/* Feed list */}
        <Box>
          <Group justify="space-between" mb={6}>
            <Text size="xs" fw={700} ff="monospace" style={{ letterSpacing: '0.1em', color: labelColor }}>
              CONFIGURED FEEDS
            </Text>
            {loading && <Loader size="xs" color="brand" type="dots" />}
          </Group>

          <ScrollArea.Autosize mah={340} scrollbarSize={4}>
            <Stack gap={0}>
              {feeds.map((feed, i) => (
                <Box key={feed.name}>
                  {i > 0 && (
                    <Divider color={isDark ? 'rgba(0,212,124,0.06)' : 'rgba(0,120,70,0.06)'} />
                  )}
                  <Group
                    justify="space-between"
                    align="center"
                    py="xs"
                    px="xs"
                    style={{ opacity: feed.enabled ? 1 : 0.45, transition: 'opacity 0.15s' }}
                  >
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" align="center">
                        <Box
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            flexShrink: 0,
                            background: feed.enabled
                              ? (isDark ? '#00d47c' : '#007840')
                              : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'),
                          }}
                        />
                        <Text size="xs" fw={500} style={{ lineHeight: 1.3 }}>
                          {feed.name}
                        </Text>
                        <Badge size="xs" variant="outline" color="gray" radius="sm" style={{ fontSize: 9 }}>
                          {feed.url.toLowerCase().endsWith('.csv') ? 'CSV' : 'RSS'}
                        </Badge>
                      </Group>
                      <Text
                        size="xs"
                        c="dimmed"
                        component="a"
                        href={feed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          fontSize: 10,
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: 340,
                          marginLeft: 14,
                          opacity: 0.6,
                          textDecoration: 'none',
                        }}
                      >
                        {feed.url}
                      </Text>
                    </Box>

                    <Group gap="xs" align="center" style={{ flexShrink: 0 }}>
                      <Tooltip
                        label={feed.enabled ? 'Pause fetching' : 'Resume fetching'}
                        position="left"
                        withArrow
                      >
                        <Switch
                          size="xs"
                          checked={feed.enabled}
                          onChange={(e) => handleToggle(feed.name, e.currentTarget.checked)}
                          color="brand"
                          aria-label={feed.enabled ? `Disable ${feed.name}` : `Enable ${feed.name}`}
                        />
                      </Tooltip>

                      <Tooltip
                        label={confirmDelete === feed.name ? 'Click again to confirm delete' : 'Delete feed'}
                        position="left"
                        withArrow
                      >
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color={confirmDelete === feed.name ? 'red' : 'gray'}
                          onClick={() => handleDelete(feed.name)}
                          aria-label={`Delete ${feed.name}`}
                        >
                          <IconTrash size={13} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
                </Box>
              ))}
              {!loading && feeds.length === 0 && (
                <Text size="xs" c="dimmed" ff="monospace" ta="center" py="md">
                  NO FEEDS CONFIGURED
                </Text>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </Box>

        <Divider color={isDark ? 'rgba(0,212,124,0.1)' : 'rgba(0,120,70,0.1)'} />

        {/* Add feed form */}
        <Box>
          <Text size="xs" fw={700} ff="monospace" mb="xs" style={{ letterSpacing: '0.1em', color: labelColor }}>
            ADD FEED
          </Text>
          <Stack gap="xs">
            <Group gap="xs" align="flex-start">
              <TextInput
                placeholder="Display name"
                value={newName}
                onChange={(e) => setNewName(e.currentTarget.value)}
                size="xs"
                style={{ flex: '0 0 180px' }}
                ff="monospace"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              />
              <TextInput
                placeholder="https://example.com/feed.xml"
                value={newURL}
                onChange={(e) => setNewURL(e.currentTarget.value)}
                size="xs"
                style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
              />
              <Button
                size="xs"
                color="brand"
                variant="filled"
                leftSection={<IconPlus size={13} />}
                onClick={handleAdd}
                loading={addLoading}
              >
                Add
              </Button>
            </Group>
            {addError && (
              <Text size="xs" c="red" style={{ fontSize: 11 }}>{addError}</Text>
            )}
          </Stack>
        </Box>

        <Divider color={isDark ? 'rgba(0,212,124,0.1)' : 'rgba(0,120,70,0.1)'} />

        {/* Footer */}
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: 10, letterSpacing: '0.04em' }}>
            TOGGLE = PAUSE/RESUME FETCHING · CHANGES APPLY ON NEXT REFRESH
          </Text>
          <Button
            size="xs"
            variant="light"
            color="brand"
            leftSection={<IconRefresh size={13} />}
            onClick={handleSaveAndRefresh}
          >
            Refresh now
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
