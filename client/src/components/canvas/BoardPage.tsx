import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useCanvasStore, type CanvasElement } from '../../store/canvasStore'
import { getSocket } from '../../lib/socket'
import { api } from '../../lib/api'
import { Toolbar } from '../toolbar/Toolbar'
import { Canvas } from './Canvas'
import { PresenceBar } from './PresenceBar'
import { PropertiesPanel } from './PropertiesPanel'
import styles from './BoardPage.module.css'

export function BoardPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const { setElements, upsertElement, deleteElement, setPresence, pushHistory } = useCanvasStore()
  const [room, setRoom] = useState<any>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<any>(null)

  useEffect(() => {
    if (!roomId || !token || !user) return

    // Load room info
    api.rooms.get(roomId).then(setRoom).catch(() => {
      setError('Room not found or access denied')
    })

    // Connect socket
    const socket = getSocket(token)
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('room:join', roomId)
    })

    socket.on('disconnect', () => setConnected(false))

    socket.on('canvas:init', ({ elements }: { elements: CanvasElement[]; version: number }) => {
      setElements(elements)
      pushHistory()
    })

    socket.on('element:upsert', (el: CanvasElement) => {
      upsertElement(el)
    })

    socket.on('element:batch-upsert', (els: CanvasElement[]) => {
      els.forEach(el => upsertElement(el))
    })

    socket.on('element:delete', (id: string) => {
      deleteElement(id)
    })

    socket.on('presence:update', (presence: any[]) => {
      setPresence(presence.filter(p => p.userId !== user.id))
    })

    socket.on('cursor:move', (data: any) => {
      // Handled by PresenceBar via store
    })

    if (socket.connected) {
      setConnected(true)
      socket.emit('room:join', roomId)
    }

    return () => {
      socket.off('canvas:init')
      socket.off('element:upsert')
      socket.off('element:batch-upsert')
      socket.off('element:delete')
      socket.off('presence:update')
      socket.off('cursor:move')
    }
  }, [roomId, token, user])

  const emitUpsert = useCallback((el: CanvasElement) => {
    socketRef.current?.emit('element:upsert', el)
  }, [])

  const emitDelete = useCallback((id: string) => {
    socketRef.current?.emit('element:delete', id)
  }, [])

  const emitCursor = useCallback((x: number, y: number) => {
    socketRef.current?.emit('cursor:move', { x, y })
  }, [])

  const emitBatchUpsert = useCallback((els: CanvasElement[]) => {
    socketRef.current?.emit('element:batch-upsert', els)
  }, [])

  if (error) {
    return (
      <div className={styles.errorState}>
        <p>{error}</p>
        <button onClick={() => navigate('/')}>Back to boards</button>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      <div className={styles.topbar}>
        <div className={styles.topLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/')} title="Back to boards">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="11" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5"/>
              <rect x="1" y="11" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5"/>
              <rect x="11" y="11" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
          <span className={styles.roomName}>{room?.name ?? '…'}</span>
          <div className={styles.connDot} data-connected={connected} title={connected ? 'Connected' : 'Disconnected'} />
        </div>
        <PresenceBar />
      </div>

      <div className={styles.workspace}>
        <Toolbar />
        <Canvas
          roomId={roomId!}
          userId={user!.id}
          onElementChange={emitUpsert}
          onElementDelete={emitDelete}
          onCursorMove={emitCursor}
          onBatchChange={emitBatchUpsert}
        />
        <PropertiesPanel onElementChange={emitUpsert} />
      </div>
    </div>
  )
}
