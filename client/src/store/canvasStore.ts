import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type Tool = 'select' | 'pan' | 'rect' | 'ellipse' | 'arrow' | 'line' | 'freehand' | 'sticky' | 'text' | 'eraser' | 'comment' | 'laser'
export type ElementType = 'rect' | 'ellipse' | 'arrow' | 'line' | 'freehand' | 'sticky' | 'text' | 'comment'

export interface CanvasElement {
  id: string
  roomId?: string
  type: ElementType
  x: number
  y: number
  width?: number
  height?: number
  points?: [number, number][]
  text?: string
  color: string
  strokeColor: string
  strokeWidth: number
  fontSize?: number
  rotation?: number
  opacity?: number
  collapsed?: boolean
  resolved?: boolean
  authorName?: string
  zIndex: number
  createdBy: string
  updatedBy?: string
  createdAt: number
  updatedAt: number
  version: number
  selected?: boolean
  deleted?: boolean
}

export interface BoardComment {
  id: string
  roomId: string
  elementId?: string
  x: number
  y: number
  body: string
  authorId: string
  authorName: string
  resolved: boolean
  replies: Array<{ id: string; body: string; authorId: string; authorName: string; createdAt: number }>
  createdAt: number
  updatedAt: number
}

export interface ViewState {
  x: number
  y: number
  zoom: number
}

export interface Presence {
  userId: string
  username: string
  color: string
  activeTool: Tool
  cursor: { x: number; y: number }
  editingElementId?: string
}

export interface SyncDebug {
  connected: boolean
  reconnecting: boolean
  lastSyncAt?: number
  latencyMs?: number
  pendingOpsCount: number
  rejectedOps: number
  roomVersion: number
  connectedUsers: number
}

interface CanvasStore {
  elements: Map<string, CanvasElement>
  comments: BoardComment[]
  selectedIds: Set<string>
  tool: Tool
  strokeColor: string
  fillColor: string
  strokeWidth: number
  fontSize: number
  view: ViewState
  presence: Presence[]
  history: Map<string, CanvasElement>[]
  historyIndex: number
  isDrawing: boolean
  gridEnabled: boolean
  highContrast: boolean
  reducedMotion: boolean
  pendingOps: Array<{ id: string; type: string; payload: unknown; createdAt: number }>
  rejectedOps: number
  roomVersion: number
  connectedUsers: number
  lastSyncAt?: number
  latencyMs?: number
  connected: boolean
  reconnecting: boolean

  upsertElement: (el: CanvasElement, opts?: { remote?: boolean }) => void
  upsertElements: (els: CanvasElement[], opts?: { remote?: boolean }) => void
  updateElement: (id: string, updates: Partial<CanvasElement>) => CanvasElement | null
  deleteElement: (id: string) => void
  deleteElements: (ids: string[]) => void
  setElements: (els: CanvasElement[]) => void
  setComments: (comments: BoardComment[]) => void
  upsertComment: (comment: BoardComment) => void
  resolveComment: (id: string) => void

  setSelected: (ids: string[]) => void
  clearSelection: () => void
  duplicateSelected: (userId: string) => CanvasElement[]
  bringForward: () => CanvasElement[]
  sendBackward: () => CanvasElement[]
  alignSelected: (mode: 'left' | 'right' | 'top' | 'bottom') => CanvasElement[]

  setTool: (tool: Tool) => void
  setStrokeColor: (c: string) => void
  setFillColor: (c: string) => void
  setStrokeWidth: (w: number) => void
  setFontSize: (s: number) => void
  toggleGrid: () => void
  toggleHighContrast: () => void
  toggleReducedMotion: () => void

  setView: (v: Partial<ViewState>) => void
  zoomTo: (zoom: number, cx?: number, cy?: number) => void
  resetView: () => void
  fitToContent: (width: number, height: number) => void

  setPresence: (presence: Presence[]) => void
  setSync: (patch: Partial<Omit<SyncDebug, 'pendingOpsCount'>>) => void
  enqueueOp: (type: string, payload: unknown) => string
  ackOp: (id?: string) => void
  rejectOp: (id?: string) => void
  clearPendingOps: () => void

  pushHistory: () => void
  undo: () => CanvasElement[] | null
  redo: () => CanvasElement[] | null
  setIsDrawing: (v: boolean) => void
  createElement: (type: ElementType, userId: string, overrides?: Partial<CanvasElement>) => CanvasElement
  getZIndex: () => number
}

const MAX_HISTORY = 80

function snapshotOf(elements: Map<string, CanvasElement>) {
  return new Map(Array.from(elements.entries()).map(([id, el]) => [id, { ...el }]))
}

function isIncomingNewer(existing: CanvasElement | undefined, incoming: CanvasElement) {
  if (!existing) return true
  if ((incoming.version ?? 0) !== (existing.version ?? 0)) return (incoming.version ?? 0) >= (existing.version ?? 0)
  return incoming.updatedAt >= existing.updatedAt
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  elements: new Map(),
  comments: [],
  selectedIds: new Set(),
  tool: 'select',
  strokeColor: '#1f2937',
  fillColor: 'transparent',
  strokeWidth: 2,
  fontSize: 16,
  view: { x: 260, y: 160, zoom: 1 },
  presence: [],
  history: [],
  historyIndex: -1,
  isDrawing: false,
  gridEnabled: true,
  highContrast: false,
  reducedMotion: false,
  pendingOps: [],
  rejectedOps: 0,
  roomVersion: 0,
  connectedUsers: 0,
  connected: false,
  reconnecting: false,

  upsertElement: (el, opts) => set(state => {
    const elements = new Map(state.elements)
    const existing = elements.get(el.id)
    if (opts?.remote && !isIncomingNewer(existing, el)) return { elements }
    if (el.deleted) elements.delete(el.id)
    else elements.set(el.id, { ...existing, ...el, version: el.version ?? ((existing?.version ?? 0) + 1) })
    return { elements }
  }),

  upsertElements: (els, opts) => set(state => {
    const elements = new Map(state.elements)
    els.forEach(el => {
      const existing = elements.get(el.id)
      if (opts?.remote && !isIncomingNewer(existing, el)) return
      if (el.deleted) elements.delete(el.id)
      else elements.set(el.id, { ...existing, ...el, version: el.version ?? ((existing?.version ?? 0) + 1) })
    })
    return { elements }
  }),

  updateElement: (id, updates) => {
    const current = get().elements.get(id)
    if (!current) return null
    const updated = { ...current, ...updates, updatedAt: Date.now(), version: current.version + 1 }
    get().upsertElement(updated)
    return updated
  },

  deleteElement: (id) => set(state => {
    const elements = new Map(state.elements)
    elements.delete(id)
    const selectedIds = new Set(state.selectedIds)
    selectedIds.delete(id)
    return { elements, selectedIds }
  }),

  deleteElements: (ids) => set(state => {
    const elements = new Map(state.elements)
    const selectedIds = new Set(state.selectedIds)
    ids.forEach(id => { elements.delete(id); selectedIds.delete(id) })
    return { elements, selectedIds }
  }),

  setElements: (els) => set(() => {
    const elements = new Map<string, CanvasElement>()
    els.filter(el => !el.deleted).forEach(el => elements.set(el.id, { ...el, version: el.version ?? 1 }))
    return { elements }
  }),

  setComments: (comments) => set({ comments }),
  upsertComment: (comment) => set(state => {
    const comments = state.comments.filter(c => c.id !== comment.id)
    comments.push(comment)
    return { comments: comments.sort((a, b) => a.createdAt - b.createdAt) }
  }),
  resolveComment: (id) => set(state => ({
    comments: state.comments.map(c => c.id === id ? { ...c, resolved: true, updatedAt: Date.now() } : c),
  })),

  setSelected: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),

  duplicateSelected: (userId) => {
    const { selectedIds, elements } = get()
    const copies = Array.from(selectedIds).map(id => elements.get(id)).filter(Boolean).map(el => {
      const now = Date.now()
      return {
        ...el!,
        id: nanoid(10),
        x: el!.x + 24,
        y: el!.y + 24,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
        version: 1,
        zIndex: get().getZIndex(),
      }
    })
    get().upsertElements(copies)
    get().setSelected(copies.map(el => el.id))
    return copies
  },

  bringForward: () => {
    const updates = Array.from(get().selectedIds).map(id => {
      const el = get().elements.get(id)
      return el ? { ...el, zIndex: get().getZIndex(), updatedAt: Date.now(), version: el.version + 1 } : null
    }).filter(Boolean) as CanvasElement[]
    get().upsertElements(updates)
    return updates
  },

  sendBackward: () => {
    const min = Math.min(0, ...Array.from(get().elements.values()).map(e => e.zIndex))
    const updates = Array.from(get().selectedIds).map(id => {
      const el = get().elements.get(id)
      return el ? { ...el, zIndex: min - 1, updatedAt: Date.now(), version: el.version + 1 } : null
    }).filter(Boolean) as CanvasElement[]
    get().upsertElements(updates)
    return updates
  },

  alignSelected: (mode) => {
    const selected = Array.from(get().selectedIds).map(id => get().elements.get(id)).filter(Boolean) as CanvasElement[]
    if (selected.length < 2) return []
    const target = mode === 'left' ? Math.min(...selected.map(e => e.x))
      : mode === 'right' ? Math.max(...selected.map(e => e.x + (e.width ?? 0)))
      : mode === 'top' ? Math.min(...selected.map(e => e.y))
      : Math.max(...selected.map(e => e.y + (e.height ?? 0)))
    const updates = selected.map(el => ({
      ...el,
      x: mode === 'left' ? target : mode === 'right' ? target - (el.width ?? 0) : el.x,
      y: mode === 'top' ? target : mode === 'bottom' ? target - (el.height ?? 0) : el.y,
      updatedAt: Date.now(),
      version: el.version + 1,
    }))
    get().upsertElements(updates)
    return updates
  },

  setTool: (tool) => set({ tool, selectedIds: tool === 'select' ? get().selectedIds : new Set() }),
  setStrokeColor: (strokeColor) => set({ strokeColor }),
  setFillColor: (fillColor) => set({ fillColor }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setFontSize: (fontSize) => set({ fontSize }),
  toggleGrid: () => set(state => ({ gridEnabled: !state.gridEnabled })),
  toggleHighContrast: () => set(state => ({ highContrast: !state.highContrast })),
  toggleReducedMotion: () => set(state => ({ reducedMotion: !state.reducedMotion })),

  setView: (v) => set(state => ({ view: { ...state.view, ...v } })),
  zoomTo: (zoom, cx, cy) => set(state => {
    const clamped = Math.max(0.08, Math.min(5, zoom))
    if (cx !== undefined && cy !== undefined) {
      const scale = clamped / state.view.zoom
      return { view: { x: cx - scale * (cx - state.view.x), y: cy - scale * (cy - state.view.y), zoom: clamped } }
    }
    return { view: { ...state.view, zoom: clamped } }
  }),
  resetView: () => set({ view: { x: 260, y: 160, zoom: 1 } }),
  fitToContent: (width, height) => set(state => {
    const els = Array.from(state.elements.values())
    if (!els.length) return { view: { x: width / 2, y: height / 2, zoom: 1 } }
    const minX = Math.min(...els.map(e => e.x))
    const minY = Math.min(...els.map(e => e.y))
    const maxX = Math.max(...els.map(e => e.x + (e.width ?? 1)))
    const maxY = Math.max(...els.map(e => e.y + (e.height ?? 1)))
    const contentW = Math.max(1, maxX - minX)
    const contentH = Math.max(1, maxY - minY)
    const zoom = Math.max(0.08, Math.min(2, Math.min((width - 120) / contentW, (height - 120) / contentH)))
    return { view: { zoom, x: width / 2 - (minX + contentW / 2) * zoom, y: height / 2 - (minY + contentH / 2) * zoom } }
  }),

  setPresence: (presence) => set({ presence, connectedUsers: presence.length }),
  setSync: (patch) => set(state => ({ ...state, ...patch })),
  enqueueOp: (type, payload) => {
    const id = nanoid(8)
    set(state => ({ pendingOps: [...state.pendingOps, { id, type, payload, createdAt: Date.now() }] }))
    return id
  },
  ackOp: (id) => set(state => ({
    pendingOps: id ? state.pendingOps.filter(op => op.id !== id) : state.pendingOps.slice(1),
    lastSyncAt: Date.now(),
  })),
  rejectOp: (id) => set(state => ({
    pendingOps: id ? state.pendingOps.filter(op => op.id !== id) : state.pendingOps.slice(1),
    rejectedOps: state.rejectedOps + 1,
    lastSyncAt: Date.now(),
  })),
  clearPendingOps: () => set({ pendingOps: [] }),

  pushHistory: () => set(state => {
    const history = state.history.slice(0, state.historyIndex + 1)
    history.push(snapshotOf(state.elements))
    if (history.length > MAX_HISTORY) history.shift()
    return { history, historyIndex: history.length - 1 }
  }),
  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return null
    const newIndex = historyIndex - 1
    const elements = snapshotOf(history[newIndex])
    set({ elements, historyIndex: newIndex, selectedIds: new Set() })
    return Array.from(elements.values()).map(el => ({ ...el, updatedAt: Date.now(), version: el.version + 1 }))
  },
  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return null
    const newIndex = historyIndex + 1
    const elements = snapshotOf(history[newIndex])
    set({ elements, historyIndex: newIndex, selectedIds: new Set() })
    return Array.from(elements.values()).map(el => ({ ...el, updatedAt: Date.now(), version: el.version + 1 }))
  },

  setIsDrawing: (isDrawing) => set({ isDrawing }),
  createElement: (type, userId, overrides = {}) => {
    const { strokeColor, fillColor, strokeWidth, fontSize } = get()
    const now = Date.now()
    return {
      id: nanoid(10),
      type,
      x: 0,
      y: 0,
      width: type === 'line' || type === 'arrow' ? 120 : 140,
      height: type === 'line' || type === 'arrow' ? 0 : 90,
      color: type === 'sticky' ? '#fff2a8' : fillColor,
      strokeColor,
      strokeWidth,
      fontSize,
      opacity: 1,
      zIndex: get().getZIndex(),
      createdBy: userId,
      updatedBy: userId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      ...overrides,
    }
  },
  getZIndex: () => {
    const values = Array.from(get().elements.values()).map(e => e.zIndex)
    return values.length ? Math.max(...values) + 1 : 1
  },
}))
