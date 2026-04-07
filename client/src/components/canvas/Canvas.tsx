import { useRef, useEffect, useCallback, useState } from 'react'
import { useCanvasStore, type CanvasElement } from '../../store/canvasStore'
import { renderElement, renderGrid, hitTest, screenToCanvas, getFreehandBounds } from '../../lib/renderer'
import { nanoid } from 'nanoid'
import styles from './Canvas.module.css'

interface CanvasProps {
  roomId: string
  userId: string
  onElementChange: (el: CanvasElement) => void
  onElementDelete: (id: string) => void
  onCursorMove: (x: number, y: number) => void
  onBatchChange: (els: CanvasElement[]) => void
}

export function Canvas({ userId, onElementChange, onElementDelete, onCursorMove, onBatchChange }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>()
  const drawingRef = useRef<CanvasElement | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; elX: number; elY: number; id: string } | null>(null)
  const resizeRef = useRef<{ handleIdx: number; el: CanvasElement; startX: number; startY: number } | null>(null)
  const panRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null)
  const isPanning = useRef(false)
  const textEditRef = useRef<{ el: CanvasElement; input: HTMLTextAreaElement } | null>(null)
  const [textEditing, setTextEditing] = useState<string | null>(null)
  const cursorThrottle = useRef(0)

  const store = useCanvasStore()

  // ─── Render loop ───────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const { elements, selectedIds, view, presence } = useCanvasStore.getState()

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Grid
    renderGrid(ctx, view, canvas.width, canvas.height)

    // Elements sorted by zIndex
    const sorted = Array.from(elements.values()).sort((a, b) => a.zIndex - b.zIndex)

    ctx.save()
    ctx.translate(view.x, view.y)
    ctx.scale(view.zoom, view.zoom)

    sorted.forEach(el => {
      if (el.id === textEditing) return // skip while editing
      renderElement(ctx, el, selectedIds.has(el.id))
    })

    // In-progress drawing
    if (drawingRef.current) {
      renderElement(ctx, drawingRef.current, false)
    }

    // Remote cursors
    presence.forEach(p => {
      if (!p.cursor) return
      drawCursor(ctx, p.cursor.x, p.cursor.y, p.color, p.username)
    })

    ctx.restore()
  }, [textEditing])

  const scheduleRender = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(render)
  }, [render])

  // Subscribe to store changes → re-render
  useEffect(() => {
    const unsub = useCanvasStore.subscribe(() => scheduleRender())
    scheduleRender()
    return () => { unsub(); if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [scheduleRender])

  // ─── Resize observer ───────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current!
    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current!
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
      scheduleRender()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [scheduleRender])

  // ─── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return

      // Delete selected
      if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedIds.size > 0) {
        store.pushHistory()
        store.selectedIds.forEach(id => {
          store.deleteElement(id)
          onElementDelete(id)
        })
        store.clearSelection()
        return
      }

      // Undo/redo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        const els = store.undo()
        if (els) onBatchChange(els)
        return
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        const els = store.redo()
        if (els) onBatchChange(els)
        return
      }

      // Escape
      if (e.key === 'Escape') {
        store.clearSelection()
        finishTextEdit()
        return
      }

      // Tool shortcuts
      const toolMap: Record<string, any> = { v: 'select', r: 'rect', e: 'ellipse', a: 'arrow', p: 'freehand', s: 'sticky', t: 'text', h: 'pan' }
      if (toolMap[e.key] && !e.metaKey && !e.ctrlKey) {
        store.setTool(toolMap[e.key])
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [store, onElementDelete, onBatchChange])

  // ─── Zoom (wheel) ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top

      if (e.ctrlKey || e.metaKey) {
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        store.zoomTo(store.view.zoom * delta, cx, cy)
      } else {
        store.setView({ x: store.view.x - e.deltaX, y: store.view.y - e.deltaY })
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [store])

  // ─── Pointer events ────────────────────────────────────────────────────────
  function getCanvasPos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return screenToCanvas(e.clientX - rect.left, e.clientY - rect.top, store.view)
  }

  function finishTextEdit() {
    if (!textEditRef.current) return
    const { el, input } = textEditRef.current
    const text = input.value
    input.remove()
    textEditRef.current = null
    setTextEditing(null)

    const updated = { ...el, text, updatedAt: Date.now() }
    store.upsertElement(updated)
    onElementChange(updated)
    store.pushHistory()
  }

  function startTextEdit(el: CanvasElement) {
    finishTextEdit()
    const canvas = canvasRef.current!
    const container = containerRef.current!

    const { x: sx, y: sy } = { x: el.x * store.view.zoom + store.view.x, y: el.y * store.view.zoom + store.view.y }

    const textarea = document.createElement('textarea')
    textarea.value = el.text || ''
    textarea.className = styles.textEditArea
    textarea.style.left = `${sx + 4}px`
    textarea.style.top = `${sy + (el.type === 'sticky' ? 30 : 4)}px`
    textarea.style.width = `${(el.width ?? 160) * store.view.zoom - 12}px`
    textarea.style.height = `${(el.height ?? 160) * store.view.zoom - (el.type === 'sticky' ? 40 : 8)}px`
    textarea.style.fontSize = `${(el.fontSize ?? 14) * store.view.zoom}px`

    container.appendChild(textarea)
    textarea.focus()
    textarea.select()

    textarea.addEventListener('blur', finishTextEdit)
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); finishTextEdit() }
    })

    textEditRef.current = { el, input: textarea }
    setTextEditing(el.id)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return
    canvasRef.current!.setPointerCapture(e.pointerId)
    const pos = getCanvasPos(e)
    const { tool, elements, view } = store

    // Middle mouse / space pan
    if (e.button === 1 || tool === 'pan' || (e.altKey)) {
      isPanning.current = true
      panRef.current = { startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y }
      return
    }

    // Select tool
    if (tool === 'select') {
      // Check handles first
      const selected = Array.from(store.selectedIds)
      if (selected.length === 1) {
        const el = elements.get(selected[0])
        // TODO: handle resize handles
      }

      // Hit test elements (reverse zIndex order)
      const sorted = Array.from(elements.values()).sort((a, b) => b.zIndex - a.zIndex)
      const hit = sorted.find(el => hitTest(el, pos.x, pos.y, view.zoom))

      if (hit) {
        if (!e.shiftKey) store.setSelected([hit.id])
        else {
          const s = new Set(store.selectedIds)
          s.has(hit.id) ? s.delete(hit.id) : s.add(hit.id)
          store.setSelected(Array.from(s))
        }
        dragRef.current = { startX: pos.x, startY: pos.y, elX: hit.x, elY: hit.y, id: hit.id }
      } else {
        store.clearSelection()
      }
      return
    }

    // Eraser
    if (tool === 'eraser') {
      const sorted = Array.from(elements.values()).sort((a, b) => b.zIndex - a.zIndex)
      const hit = sorted.find(el => hitTest(el, pos.x, pos.y, view.zoom))
      if (hit) {
        store.pushHistory()
        store.deleteElement(hit.id)
        onElementDelete(hit.id)
      }
      return
    }

    // Drawing tools
    store.pushHistory()
    const type = tool as CanvasElement['type']
    const now = Date.now()
    const base: CanvasElement = {
      id: nanoid(10),
      type,
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
      color: type === 'sticky' ? '#2a2a1e' : store.fillColor,
      strokeColor: store.strokeColor,
      strokeWidth: store.strokeWidth,
      fontSize: store.fontSize,
      opacity: 1,
      zIndex: store.getZIndex(),
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    }

    if (type === 'freehand') base.points = [[pos.x, pos.y]]
    if (type === 'sticky') { base.width = 160; base.height = 160; base.text = '' }

    drawingRef.current = base
    store.setIsDrawing(true)
  }

  function onPointerMove(e: React.PointerEvent) {
    const pos = getCanvasPos(e)

    // Throttled cursor emit
    const now = Date.now()
    if (now - cursorThrottle.current > 40) {
      onCursorMove(pos.x, pos.y)
      cursorThrottle.current = now
    }

    // Pan
    if (isPanning.current && panRef.current) {
      const dx = e.clientX - panRef.current.startX
      const dy = e.clientY - panRef.current.startY
      store.setView({ x: panRef.current.viewX + dx, y: panRef.current.viewY + dy })
      return
    }

    // Drag selected element
    if (dragRef.current) {
      const { startX, startY, elX, elY, id } = dragRef.current
      const dx = pos.x - startX
      const dy = pos.y - startY
      const el = store.elements.get(id)
      if (!el) return
      const updated = { ...el, x: elX + dx, y: elY + dy, updatedAt: Date.now() }
      store.upsertElement(updated)
      scheduleRender()
      return
    }

    // Drawing
    if (!drawingRef.current || !store.isDrawing) return
    const el = drawingRef.current
    const dx = pos.x - el.x
    const dy = pos.y - el.y

    if (el.type === 'freehand') {
      drawingRef.current = { ...el, points: [...(el.points ?? []), [pos.x, pos.y]] }
    } else {
      drawingRef.current = { ...el, width: dx, height: dy }
    }
    scheduleRender()
  }

  function onPointerUp(e: React.PointerEvent) {
    isPanning.current = false
    panRef.current = null

    // Finish drag
    if (dragRef.current) {
      const el = store.elements.get(dragRef.current.id)
      if (el) onElementChange(el)
      dragRef.current = null
      return
    }

    // Finish drawing
    if (drawingRef.current && store.isDrawing) {
      const el = drawingRef.current
      drawingRef.current = null
      store.setIsDrawing(false)

      // Normalize rect/ellipse (negative width/height)
      let finalEl = { ...el, updatedAt: Date.now() }
      if ((el.type === 'rect' || el.type === 'ellipse' || el.type === 'arrow') && el.width !== undefined && el.height !== undefined) {
        if (el.width < 0) { finalEl.x = el.x + el.width; finalEl.width = Math.abs(el.width) }
        if (el.height < 0) { finalEl.y = el.y + el.height; finalEl.height = Math.abs(el.height) }
      }

      if (el.type === 'freehand') {
        const bounds = getFreehandBounds(el)
        finalEl.width = bounds.w
        finalEl.height = bounds.h
      }

      // Minimum size guard
      if ((finalEl.type === 'rect' || finalEl.type === 'ellipse') && (finalEl.width ?? 0) < 4 && (finalEl.height ?? 0) < 4) {
        finalEl.width = 100; finalEl.height = 60
      }

      if (el.type === 'sticky') {
        store.upsertElement(finalEl)
        onElementChange(finalEl)
        setTimeout(() => startTextEdit(finalEl), 50)
      } else if (el.type === 'text') {
        finalEl.width = 200; finalEl.height = 40
        store.upsertElement(finalEl)
        onElementChange(finalEl)
        setTimeout(() => startTextEdit(finalEl), 50)
      } else {
        store.upsertElement(finalEl)
        onElementChange(finalEl)
        store.setSelected([finalEl.id])
      }

      store.setTool('select')
    }
  }

  function onDoubleClick(e: React.PointerEvent) {
    const pos = getCanvasPos(e)
    const sorted = Array.from(store.elements.values()).sort((a, b) => b.zIndex - a.zIndex)
    const hit = sorted.find(el => hitTest(el, pos.x, pos.y, store.view.zoom))
    if (hit && (hit.type === 'sticky' || hit.type === 'text' || hit.type === 'rect')) {
      startTextEdit(hit)
    }
  }

  // Cursor style
  const getCursor = () => {
    if (isPanning.current) return 'grabbing'
    const { tool } = store
    if (tool === 'pan') return 'grab'
    if (tool === 'select') return 'default'
    if (tool === 'eraser') return 'crosshair'
    return 'crosshair'
  }

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ cursor: getCursor() }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick as any}
      />
      {/* Zoom indicator */}
      <div className={styles.zoomBadge}>
        <span>{Math.round(store.view.zoom * 100)}%</span>
        <button onClick={() => store.zoomTo(1)}>Reset</button>
      </div>
    </div>
  )
}

function drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, name: string) {
  // Arrow cursor
  ctx.save()
  ctx.fillStyle = color
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + 10, y + 14)
  ctx.lineTo(x + 4, y + 12)
  ctx.lineTo(x + 2, y + 17)
  ctx.lineTo(x, y + 13)
  ctx.lineTo(x, y)
  ctx.fill()
  ctx.stroke()

  // Label
  ctx.fillStyle = color
  ctx.font = '11px DM Sans, sans-serif'
  const w = ctx.measureText(name).width + 10
  const lx = x + 12, ly = y + 18
  ctx.beginPath()
  ctx.roundRect(lx, ly, w, 18, 4)
  ctx.fill()
  ctx.fillStyle = 'white'
  ctx.textBaseline = 'middle'
  ctx.fillText(name, lx + 5, ly + 9)
  ctx.restore()
}
