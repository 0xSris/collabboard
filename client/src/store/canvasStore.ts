import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type Tool = 'select' | 'rect' | 'ellipse' | 'arrow' | 'freehand' | 'sticky' | 'text' | 'pan' | 'eraser'

export interface CanvasElement {
  id: string
  type: 'rect' | 'ellipse' | 'arrow' | 'freehand' | 'sticky' | 'text'
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
  zIndex: number
  createdBy: string
  createdAt: number
  updatedAt: number
  selected?: boolean
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
  cursor: { x: number; y: number }
}

interface CanvasStore {
  elements: Map<string, CanvasElement>
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

  // Element ops
  upsertElement: (el: CanvasElement) => void
  upsertElements: (els: CanvasElement[]) => void
  updateElement: (id: string, updates: Partial<CanvasElement>) => void
  deleteElement: (id: string) => void
  deleteElements: (ids: string[]) => void
  setElements: (els: CanvasElement[]) => void

  // Selection
  setSelected: (ids: string[]) => void
  clearSelection: () => void

  // Tool
  setTool: (tool: Tool) => void
  setStrokeColor: (c: string) => void
  setFillColor: (c: string) => void
  setStrokeWidth: (w: number) => void
  setFontSize: (s: number) => void

  // View
  setView: (v: Partial<ViewState>) => void
  zoomTo: (zoom: number, cx?: number, cy?: number) => void

  // Presence
  setPresence: (presence: Presence[]) => void

  // History
  pushHistory: () => void
  undo: () => CanvasElement[] | null
  redo: () => CanvasElement[] | null

  // Drawing
  setIsDrawing: (v: boolean) => void

  // Utility
  createElement: (type: CanvasElement['type'], userId: string, overrides?: Partial<CanvasElement>) => CanvasElement
  getZIndex: () => number
}

const MAX_HISTORY = 50

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  elements: new Map(),
  selectedIds: new Set(),
  tool: 'select',
  strokeColor: '#e8e8e8',
  fillColor: 'transparent',
  strokeWidth: 2,
  fontSize: 16,
  view: { x: 0, y: 0, zoom: 1 },
  presence: [],
  history: [],
  historyIndex: -1,
  isDrawing: false,

  upsertElement: (el) => set(state => {
    const elements = new Map(state.elements)
    elements.set(el.id, el)
    return { elements }
  }),

  upsertElements: (els) => set(state => {
    const elements = new Map(state.elements)
    els.forEach(el => elements.set(el.id, el))
    return { elements }
  }),

  updateElement: (id, updates) => set(state => {
    const elements = new Map(state.elements)
    const el = elements.get(id)
    if (el) {
      elements.set(id, { ...el, ...updates, updatedAt: Date.now() })
    }
    return { elements }
  }),

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
    els.forEach(el => elements.set(el.id, el))
    return { elements }
  }),

  setSelected: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set() }),

  setTool: (tool) => set({ tool, selectedIds: new Set() }),
  setStrokeColor: (strokeColor) => set({ strokeColor }),
  setFillColor: (fillColor) => set({ fillColor }),
  setStrokeWidth: (strokeWidth) => set({ strokeWidth }),
  setFontSize: (fontSize) => set({ fontSize }),

  setView: (v) => set(state => ({ view: { ...state.view, ...v } })),

  zoomTo: (zoom, cx, cy) => set(state => {
    const clamped = Math.max(0.1, Math.min(4, zoom))
    if (cx !== undefined && cy !== undefined) {
      const scale = clamped / state.view.zoom
      const x = cx - scale * (cx - state.view.x)
      const y = cy - scale * (cy - state.view.y)
      return { view: { x, y, zoom: clamped } }
    }
    return { view: { ...state.view, zoom: clamped } }
  }),

  setPresence: (presence) => set({ presence }),

  pushHistory: () => set(state => {
    const snapshot = new Map(state.elements)
    const history = state.history.slice(0, state.historyIndex + 1)
    history.push(snapshot)
    if (history.length > MAX_HISTORY) history.shift()
    return { history, historyIndex: history.length - 1 }
  }),

  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return null
    const newIndex = historyIndex - 1
    const snapshot = history[newIndex]
    const elements = new Map(snapshot)
    set({ elements, historyIndex: newIndex })
    return Array.from(elements.values())
  },

  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return null
    const newIndex = historyIndex + 1
    const snapshot = history[newIndex]
    const elements = new Map(snapshot)
    set({ elements, historyIndex: newIndex })
    return Array.from(elements.values())
  },

  setIsDrawing: (isDrawing) => set({ isDrawing }),

  createElement: (type, userId, overrides = {}) => {
    const { strokeColor, fillColor, strokeWidth, fontSize } = get()
    const now = Date.now()
    return {
      id: nanoid(10),
      type,
      x: 0, y: 0,
      width: 120, height: 80,
      color: fillColor,
      strokeColor,
      strokeWidth,
      fontSize,
      opacity: 1,
      zIndex: get().getZIndex(),
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }
  },

  getZIndex: () => {
    const { elements } = get()
    if (elements.size === 0) return 0
    return Math.max(...Array.from(elements.values()).map(e => e.zIndex)) + 1
  },
}))
