import type { ClientMessage, ServerMessage } from './protocol'

export interface RoomConnectionCloseDetails {
  code: number
  reason: string
  wasClean: boolean
}

export interface RoomConnectionHandlers {
  onMessage: (message: ServerMessage) => void
  onOpen?: () => void
  onClose?: (details: RoomConnectionCloseDetails) => void
  onError?: (message: string) => void
}

export interface RoomConnection {
  send: (message: ClientMessage) => void
  close: () => void
}

function defaultSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

export function openRoomConnection(
  handlers: RoomConnectionHandlers,
  socketUrl: string = defaultSocketUrl(),
): RoomConnection {
  const socket = new WebSocket(socketUrl)
  const queuedMessages: string[] = []
  let isOpen = false

  const flushQueue = (): void => {
    while (queuedMessages.length > 0) {
      const nextMessage = queuedMessages.shift()

      if (nextMessage !== undefined) {
        socket.send(nextMessage)
      }
    }
  }

  socket.addEventListener('open', () => {
    isOpen = true
    console.info('[room-socket] opened', {
      socketUrl,
    })
    flushQueue()
    handlers.onOpen?.()
  })

  socket.addEventListener('message', (event) => {
    try {
      handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage)
    } catch {
      handlers.onError?.('The server sent an unreadable message.')
    }
  })

  socket.addEventListener('close', (event) => {
    isOpen = false
    const details: RoomConnectionCloseDetails = {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    }

    console.warn('[room-socket] closed', {
      socketUrl,
      ...details,
    })
    handlers.onClose?.(details)
  })

  socket.addEventListener('error', () => {
    console.warn('[room-socket] error', {
      socketUrl,
      readyState: socket.readyState,
    })
    handlers.onError?.('The room connection failed.')
  })

  return {
    send(message) {
      const serialized = JSON.stringify(message)

      if (isOpen) {
        socket.send(serialized)
        return
      }

      queuedMessages.push(serialized)
    },
    close() {
      socket.close()
    },
  }
}
