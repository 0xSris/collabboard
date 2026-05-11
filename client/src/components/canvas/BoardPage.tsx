import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Download, FileJson, History, Import, Keyboard, Link2, MessageSquare, Search, Wifi, WifiOff } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useCanvasStore, type CanvasElement, type BoardComment, type Tool } from '../../store/canvasStore'
import { getSocket } from '../../lib/socket'
import { api } from '../../lib/api'
import { Toolbar } from '../toolbar/Toolbar'
import { Canvas } from './Canvas'
import { PresenceBar } from './PresenceBar'
import { PropertiesPanel } from './PropertiesPanel'
import styles from './BoardPage.module.css'

const COMMANDS: Array<{ label: string; shortcut: string; action: (ctx: { setTool: (tool: Tool) => void; exportJson: () => void; exportPng: () => void; openShortcuts: () => void }) => void }> = [
  { label: 'Create sticky note', shortcut: 'S', action: ({ setTool }) => setTool('sticky') },
  { label: 'Drop comment pin', shortcut: 'C', action: ({ setTool }) => setTool('comment') },
  { label: 'Use laser pointer', shortcut: 'K', action: ({ setTool }) => setTool('laser') },
  { label: 'Export board JSON', shortcut: 'JSON', action: ({ exportJson }) => exportJson() },
  { label: 'Export PNG snapshot', shortcut: 'PNG', action: ({ exportPng }) => exportPng() },
  { label: 'Show shortcuts', shortcut: '?', action: ({ openShortcuts }) => openShortcuts() },
]

export function BoardPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const navigate = useNavigate()
  const { user, token } = useAuthStore()
  const store = useCanvasStore()
  const [room, setRoom] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCommand, setShowCommand] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showDebug, setShowDebug] = useState(true)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const socketRef = useRef<any>(null)
  const latencyRef = useRef<number>()

  useEffect(() => {
    if (!roomId || !token || !user) return
    api.rooms.get(roomId).then(setRoom).catch(() => setError('Room not found or access denied'))

    const socket = getSocket(token)
    socketRef.current = socket

    socket.on('connect', () => {
      store.setSync({ connected: true, reconnecting: false })
      socket.emit('room:join', roomId)
    })
    socket.on('disconnect', () => store.setSync({ connected: false }))
    socket.io.on('reconnect_attempt', () => store.setSync({ reconnecting: true }))
    socket.io.on('reconnect', () => {
      store.setSync({ connected: true, reconnecting: false })
      socket.emit('room:join', roomId)
      replayPendingOps()
    })

    socket.on('canvas:init', ({ elements, comments, version }: { elements: CanvasElement[]; comments: BoardComment[]; version: number }) => {
      store.setElements(elements)
      store.setComments(comments ?? [])
      store.setSync({ roomVersion: version ?? 0, lastSyncAt: Date.now() })
      store.pushHistory()
    })
    socket.on('element:upsert', (el: CanvasElement) => store.upsertElement(el, { remote: true }))
    socket.on('element:batch-upsert', (els: CanvasElement[]) => store.upsertElements(els, { remote: true }))
    socket.on('element:delete', (id: string) => store.deleteElement(id))
    socket.on('presence:update', (presence: any[]) => store.setPresence(presence.filter(p => p.userId !== user.id)))
    socket.on('comment:create', (comment: BoardComment) => store.upsertComment(comment))
    socket.on('comment:resolve', (id: string) => store.resolveComment(id))
    socket.on('sync:ack', ({ opId, version, serverTime }: { opId?: string; version?: number; serverTime?: number }) => {
      const now = Date.now()
      store.ackOp(opId)
      store.setSync({ roomVersion: version ?? store.roomVersion, lastSyncAt: now, latencyMs: serverTime ? Math.max(1, now - serverTime) : store.latencyMs })
    })
    socket.on('sync:reject', ({ opId, element }: { opId?: string; element?: CanvasElement }) => {
      store.rejectOp(opId)
      if (element) store.upsertElement(element, { remote: true })
    })
    socket.on('room:snapshot', ({ version }: { version: number }) => store.setSync({ roomVersion: version, lastSyncAt: Date.now() }))

    if (socket.connected) {
      store.setSync({ connected: true })
      socket.emit('room:join', roomId)
    }

    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('canvas:init')
      socket.off('element:upsert')
      socket.off('element:batch-upsert')
      socket.off('element:delete')
      socket.off('presence:update')
      socket.off('comment:create')
      socket.off('comment:resolve')
      socket.off('sync:ack')
      socket.off('sync:reject')
      socket.off('room:snapshot')
    }
  }, [roomId, token, user?.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setShowCommand(true)
      }
      if (event.key === '?' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        setShowShortcuts(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const emitWithQueue = useCallback((event: string, payload: unknown) => {
    const socket = socketRef.current
    const opId = store.enqueueOp(event, payload)
    if (socket?.connected) {
      latencyRef.current = Date.now()
      socket.emit(event, { opId, payload, clientTime: Date.now() })
    } else {
      store.setSync({ connected: false })
      setNotice('Offline. Changes are queued locally and will replay on reconnect.')
    }
  }, [store])

  function replayPendingOps() {
    const socket = socketRef.current
    if (!socket?.connected) return
    useCanvasStore.getState().pendingOps.forEach(op => socket.emit(op.type, { opId: op.id, payload: op.payload, clientTime: Date.now() }))
  }

  const emitUpsert = useCallback((el: CanvasElement) => emitWithQueue('element:upsert', el), [emitWithQueue])
  const emitDelete = useCallback((id: string) => emitWithQueue('element:delete', id), [emitWithQueue])
  const emitBatchUpsert = useCallback((els: CanvasElement[]) => emitWithQueue('element:batch-upsert', els), [emitWithQueue])
  const emitCursor = useCallback((x: number, y: number) => {
    const socket = socketRef.current
    if (socket?.connected) socket.emit('cursor:move', { x, y, activeTool: useCanvasStore.getState().tool })
  }, [])

  function createComment(input: { id: string; roomId: string; x: number; y: number; body: string }) {
    const comment: BoardComment = {
      ...input,
      authorId: user!.id,
      authorName: user!.username,
      resolved: false,
      replies: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    store.upsertComment(comment)
    emitWithQueue('comment:create', comment)
  }

  function resolveComment(id: string) {
    store.resolveComment(id)
    emitWithQueue('comment:resolve', id)
  }

  async function exportJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      room,
      elements: Array.from(store.elements.values()),
      comments: store.comments,
    }
    downloadBlob(JSON.stringify(payload, null, 2), `collabboard-${room?.name ?? roomId}.json`, 'application/json')
  }

  function exportPng() {
    const canvas = document.querySelector('canvas')
    if (!canvas) return
    canvas.toBlob(blob => {
      if (blob) downloadBlob(blob, `collabboard-${room?.name ?? roomId}.png`, 'image/png')
    })
  }

  async function importJson() {
    try {
      const parsed = JSON.parse(importText)
      const elements = Array.isArray(parsed.elements) ? parsed.elements : Array.isArray(parsed.snapshot?.elements) ? parsed.snapshot.elements : []
      if (!elements.length) throw new Error('No elements found')
      const sanitized = elements.map((el: CanvasElement) => ({ ...el, id: el.id || crypto.randomUUID(), roomId, updatedAt: Date.now(), version: (el.version ?? 0) + 1 }))
      store.upsertElements(sanitized)
      emitBatchUpsert(sanitized)
      setShowImport(false)
      setImportText('')
      setNotice(`Imported ${sanitized.length} elements.`)
    } catch (err: any) {
      setNotice(`Import failed: ${err.message}`)
    }
  }

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
      {notice && <div className={styles.notice} onAnimationEnd={() => setNotice(null)}>{notice}</div>}
      <div className={styles.topbar}>
        <div className={styles.topLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/')} title="Back to boards"><FileJson size={17} /></button>
          <div>
            <span className={styles.roomName}>{room?.name ?? 'Loading board'}</span>
            <div className={styles.headerMeta}>{store.elements.size} elements · {store.comments.filter(c => !c.resolved).length} unresolved comments</div>
          </div>
          <ConnectionBadge connected={store.connected} reconnecting={store.reconnecting} pending={store.pendingOps.length} />
        </div>
        <div className={styles.headerActions}>
          <button onClick={() => setShowCommand(true)} title="Command palette"><Search size={15} /> Command</button>
          <button onClick={exportJson} title="Export JSON"><Download size={15} /> JSON</button>
          <button onClick={exportPng} title="Export PNG"><Download size={15} /> PNG</button>
          <button onClick={() => setShowImport(true)} title="Import JSON"><Import size={15} /> Import</button>
          <button onClick={() => navigator.clipboard?.writeText(location.href).then(() => setNotice('Invite link copied.'))} title="Copy invite link"><Link2 size={15} /> Share</button>
          <PresenceBar />
        </div>
      </div>

      <div className={styles.workspace}>
        <Toolbar />
        <Canvas
          roomId={roomId!}
          userId={user!.id}
          username={user!.username}
          onElementChange={emitUpsert}
          onElementDelete={emitDelete}
          onCursorMove={emitCursor}
          onBatchChange={emitBatchUpsert}
          onCommentCreate={createComment}
        />
        <aside className={styles.rightRail}>
          <PropertiesPanel onElementChange={emitUpsert} />
          <CommentThreadPanel comments={store.comments} onResolve={resolveComment} />
          {showDebug && <SyncDebugPanel />}
        </aside>
      </div>

      <button className={styles.debugToggle} onClick={() => setShowDebug(v => !v)} title="Toggle sync debug">
        <History size={14} /> Sync
      </button>

      {showCommand && (
        <div className={styles.modalOverlay} onClick={() => setShowCommand(false)}>
          <div className={styles.commandPanel} onClick={e => e.stopPropagation()}>
            <div className={styles.commandInput}><Search size={16} /><span>Command palette</span></div>
            {COMMANDS.map(command => (
              <button key={command.label} className={styles.commandItem} onClick={() => {
                command.action({ setTool: store.setTool, exportJson, exportPng, openShortcuts: () => setShowShortcuts(true) })
                setShowCommand(false)
              }}>
                <span>{command.label}</span><kbd>{command.shortcut}</kbd>
              </button>
            ))}
          </div>
        </div>
      )}

      {showShortcuts && (
        <div className={styles.modalOverlay} onClick={() => setShowShortcuts(false)}>
          <div className={styles.shortcutPanel} onClick={e => e.stopPropagation()}>
            <h2><Keyboard size={18} /> Shortcuts</h2>
            <div className={styles.shortcutGrid}>
              {['V Select', 'H Pan', 'R Rectangle', 'E Ellipse', 'A Arrow', 'L Line', 'P Pen', 'T Text', 'S Sticky', 'C Comment', 'K Laser', 'X Eraser', 'Ctrl+D Duplicate', 'Ctrl+Z Undo', 'Ctrl+K Commands'].map(item => {
                const [key, ...label] = item.split(' ')
                return <div key={item}><kbd>{key}</kbd><span>{label.join(' ')}</span></div>
              })}
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className={styles.modalOverlay} onClick={() => setShowImport(false)}>
          <div className={styles.importPanel} onClick={e => e.stopPropagation()}>
            <h2>Import board JSON</h2>
            <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste a CollabBoard JSON export..." />
            <div className={styles.importActions}>
              <button onClick={() => setShowImport(false)}>Cancel</button>
              <button onClick={importJson}>Import</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ConnectionBadge({ connected, reconnecting, pending }: { connected: boolean; reconnecting: boolean; pending: number }) {
  return (
    <div className={styles.connectionBadge} data-connected={connected}>
      {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
      <span>{reconnecting ? 'Reconnecting' : connected ? 'Live' : 'Offline'}{pending ? ` · ${pending} queued` : ''}</span>
    </div>
  )
}

function SyncDebugPanel() {
  const s = useCanvasStore()
  return (
    <section className={styles.syncPanel}>
      <h3>CRDT-lite sync</h3>
      <div><span>Room version</span><strong>{s.roomVersion}</strong></div>
      <div><span>Pending ops</span><strong>{s.pendingOps.length}</strong></div>
      <div><span>Rejected stale</span><strong>{s.rejectedOps}</strong></div>
      <div><span>Socket latency</span><strong>{s.latencyMs ? `${s.latencyMs}ms` : 'measuring'}</strong></div>
      <div><span>Users</span><strong>{s.presence.length + 1}</strong></div>
      <div><span>Last sync</span><strong>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleTimeString() : 'never'}</strong></div>
    </section>
  )
}

function CommentThreadPanel({ comments, onResolve }: { comments: BoardComment[]; onResolve: (id: string) => void }) {
  const unresolved = comments.filter(c => !c.resolved)
  return (
    <section className={styles.commentPanel}>
      <h3><MessageSquare size={14} /> Comments <span>{unresolved.length}</span></h3>
      {unresolved.length === 0 ? <p>No open threads.</p> : unresolved.map(comment => (
        <article key={comment.id}>
          <strong>{comment.authorName}</strong>
          <p>{comment.body}</p>
          <button onClick={() => onResolve(comment.id)}>Resolve</button>
        </article>
      ))}
    </section>
  )
}

function downloadBlob(content: BlobPart | Blob, filename: string, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
