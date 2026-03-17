import type { ClientMessage, ServerMessage } from './protocol'

export interface RoomConnectionHandlers {
  onMessage: (message: ServerMessage) => void
  onOpen?: () => void
  onClose?: () => void
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

  socket.addEventListener('close', () => {
    isOpen = false
    handlers.onClose?.()
  })

  socket.addEventListener('error', () => {
    handlers.onError?.('The LAN room connection failed.')
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
