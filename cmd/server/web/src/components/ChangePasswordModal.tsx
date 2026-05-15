import { useState } from 'react'
import { Modal, Stack, PasswordInput, Button, Text, Alert } from '@mantine/core'
import { IconLock, IconAlertCircle, IconCheck } from '@tabler/icons-react'

interface ChangePasswordModalProps {
  opened: boolean
  onClose: () => void
  onSuccess: () => void
}

export function ChangePasswordModal({ opened, onClose, onSuccess }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const reset = () => {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError(null)
    setLoading(false)
    setDone(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = async () => {
    setError(null)
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required.')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }
    if (currentPassword === newPassword) {
      setError('New password must differ from the current password.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Failed to change password.')
        return
      }
      setDone(true)
      setTimeout(() => {
        handleClose()
        onSuccess()
      }, 1500)
    } catch {
      setError('Network error — please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Text ff="monospace" fw={700} style={{ letterSpacing: '0.06em' }}>
          CHANGE PASSWORD
        </Text>
      }
      size="sm"
      centered
    >
      {done ? (
        <Stack align="center" gap="md" py="md">
          <IconCheck size={40} color="var(--mantine-color-brand-5)" />
          <Text ff="monospace" size="sm" ta="center" c="brand">
            Password updated. All sessions have been signed out.
          </Text>
          <Text size="xs" c="dimmed" ta="center">
            Redirecting to login…
          </Text>
        </Stack>
      ) : (
        <Stack gap="sm">
          {error && (
            <Alert icon={<IconAlertCircle size={14} />} color="red" p="xs">
              <Text size="xs">{error}</Text>
            </Alert>
          )}

          <PasswordInput
            label="Current password"
            placeholder="Enter current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.currentTarget.value)}
            leftSection={<IconLock size={14} />}
            disabled={loading}
            data-autofocus
          />
          <PasswordInput
            label="New password"
            placeholder="At least 8 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.currentTarget.value)}
            leftSection={<IconLock size={14} />}
            disabled={loading}
          />
          <PasswordInput
            label="Confirm new password"
            placeholder="Repeat new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.currentTarget.value)}
            leftSection={<IconLock size={14} />}
            disabled={loading}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
          />

          <Text size="xs" c="dimmed" mt={2}>
            All active sessions — including this one — will be signed out immediately.
          </Text>

          <Button
            fullWidth
            color="brand"
            loading={loading}
            onClick={handleSubmit}
            mt="xs"
            ff="monospace"
            style={{ letterSpacing: '0.06em' }}
          >
            UPDATE PASSWORD
          </Button>
        </Stack>
      )}
    </Modal>
  )
}
