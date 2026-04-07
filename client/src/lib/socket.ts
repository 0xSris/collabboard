import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(token: string): Socket {
  if (socket?.connected) return socket

  if (socket) {
    socket.disconnect()
  }

  socket = io('/', {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  })

  socket.on('connect', () => console.log('🔌 Socket connected'))
  socket.on('disconnect', (reason) => console.log('🔌 Socket disconnected:', reason))
  socket.on('connect_error', (err) => console.error('Socket error:', err.message))

  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export { socket }
