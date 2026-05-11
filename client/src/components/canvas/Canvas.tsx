import { useRef, useEffect, useCallback, useState } from 'react'
import { nanoid } from 'nanoid'
import { useCanvasStore, type CanvasElement } from '../../store/canvasStore'
import { renderElement, renderGrid, hitTest, screenToCanvas, getFreehandBounds, elementInViewport } from '../../lib/renderer'
import styles from './Canvas.module.css'

interface CanvasProps {
  roomId: string
  userId: string
  username?: string
  onElementChange: (el: CanvasElement) => void
  onElementDelete: (id: string) => void
  onCursorMove: (x: number, y: number) => void
  onBatchChange: (els: CanvasElement[]) => void
  onCommentCreate?: (comment: { id: string; roomId: string; x: number; y: number; body: string }) => void
}

type DragMode =
  | { type: 'move'; ids: string[]; startX: number; startY: number; origins: Record<string, { x: number; y: number }> }
  | { type: 'selectBox'; startX: number; startY: number; currentX: number; currentY: number }
  | { type: 'resize'; id: string; handle: number; startX: number; startY: number; original: CanvasElement }
  | null

export function Canvas({ roomId, userId, username, onElementChange, onElementDelete, onCursorMove, onBatchChange, onCommentCreate }: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>()
  const drawingRef = useRef<CanvasElement | null>(null)
  const dragRef = useRef<DragMode>(null)
  const panRef = useRef<{ startX: number; startY: number; viewX: number; viewY: number } | null>(null)
  const isPanning = useRef(false)
  const textEditRef = useRef<{ el: CanvasElement; input: HTMLTextAreaElement } | null>(null)
  const cursorThrottle = useRef(0)
  const [textEditing, setTextEditing] = useState<string | null>(null)
  const [laser, setLaser] = useState<{ x: number; y: number; t: number } | null>(null)
  const store = useCanvasStore()

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const state = useCanvasStore.getState()

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (state.gridEnabled) renderGrid(ctx, state.view, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(state.view.x, state.view.y)
    ctx.scale(state.view.zoom, state.view.zoom)

    const sorted = Array.from(state.elements.values()).sort((a, b) => a.zIndex - b.zIndex)
    sorted.forEach(el => {
      if (el.id !== textEditing && elementInViewport(el, state.view, canvas.width, canvas.height)) {
        renderElement(ctx, el, state.selectedIds.has(el.id))
      }
    })

    if (drawingRef.current) renderElement(ctx, drawingRef.current)
    if (dragRef.current?.type === 'selectBox') drawSelectionBox(ctx, dragRef.current)
    state.presence.forEach(p => drawCursor(ctx, p.cursor.x, p.cursor.y, p.color, p.username, p.activeTool))
    if (laser && Date.now() - laser.t < 900) drawLaser(ctx, laser.x, laser.y)
    ctx.restore()
  }, [laser, textEditing])

  const scheduleRender = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(render)
  }, [render])

  useEffect(() => {
    const unsub = useCanvasStore.subscribe(() => scheduleRender())
    scheduleRender()
    return () => { unsub(); if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [scheduleRender])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(container.clientWidth * dpr)
      canvas.height = Math.floor(container.clientHeight * dpr)
      canvas.style.width = `${container.clientWidth}px`
      canvas.style.height = `${container.clientHeight}px`
      const ctx = canvas.getContext('2d')
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
      scheduleRender()
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [scheduleRender])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'TEXTAREA' || tag === 'INPUT') return
      const s = useCanvasStore.getState()

      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedIds.size) {
        e.preventDefault()
        s.pushHistory()
        Array.from(s.selectedIds).forEach(id => { s.deleteElement(id); onElementDelete(id) })
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        const els = s.undo()
        if (els) onBatchChange(els)
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        const els = s.redo()
        if (els) onBatchChange(els)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        const copies = s.duplicateSelected(userId)
        if (copies.length) onBatchChange(copies)
        return
      }
      if (e.key === 'Escape') {
        s.clearSelection()
        finishTextEdit()
        return
      }
      const toolMap: Record<string, any> = { v: 'select', h: 'pan', r: 'rect', e: 'ellipse', a: 'arrow', l: 'line', p: 'freehand', s: 'sticky', t: 'text', c: 'comment', x: 'eraser', k: 'laser' }
      const tool = toolMap[e.key.toLowerCase()]
      if (tool && !e.ctrlKey && !e.metaKey) s.setTool(tool)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onBatchChange, onElementDelete, userId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const state = useCanvasStore.getState()
      if (e.ctrlKey || e.metaKey) {
        state.zoomTo(state.view.zoom * (e.deltaY > 0 ? 0.9 : 1.1), e.clientX - rect.left, e.clientY - rect.top)
      } else {
        state.setView({ x: state.view.x - e.deltaX, y: state.view.y - e.deltaY })
      }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  function getCanvasPos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return screenToCanvas(e.clientX - rect.left, e.clientY - rect.top, useCanvasStore.getState().view)
  }

  function finishTextEdit() {
    if (!textEditRef.current) return
    const { el, input } = textEditRef.current
    input.remove()
    textEditRef.current = null
    setTextEditing(null)
    const updated = { ...el, text: input.value, updatedAt: Date.now(), version: el.version + 1 }
    useCanvasStore.getState().upsertElement(updated)
    onElementChange(updated)
    useCanvasStore.getState().pushHistory()
  }

  function startTextEdit(el: CanvasElement) {
    finishTextEdit()
    const container = containerRef.current!
    const view = useCanvasStore.getState().view
    const textarea = document.createElement('textarea')
    textarea.value = el.text || ''
    textarea.className = styles.textEditArea
    textarea.style.left = `${el.x * view.zoom + view.x + 8}px`
    textarea.style.top = `${el.y * view.zoom + view.y + (el.type === 'sticky' ? 34 : 8)}px`
    textarea.style.width = `${Math.max(120, (el.width ?? 180) * view.zoom - 16)}px`
    textarea.style.height = `${Math.max(38, (el.height ?? 80) * view.zoom - (el.type === 'sticky' ? 44 : 12))}px`
    textarea.style.fontSize = `${(el.fontSize ?? 14) * view.zoom}px`
    container.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.addEventListener('blur', finishTextEdit)
    textarea.addEventListener('keydown', event => {
      if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
        event.preventDefault()
        finishTextEdit()
      }
    })
    textEditRef.current = { el, input: textarea }
    setTextEditing(el.id)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return
    canvasRef.current!.setPointerCapture(e.pointerId)
    const pos = getCanvasPos(e)
    const state = useCanvasStore.getState()

    if (e.button === 1 || state.tool === 'pan' || e.altKey || e.buttons === 4) {
      isPanning.current = true
      panRef.current = { startX: e.clientX, startY: e.clientY, viewX: state.view.x, viewY: state.view.y }
      return
    }

    if (state.tool === 'laser') {
      setLaser({ x: pos.x, y: pos.y, t: Date.now() })
      return
    }

    if (state.tool === 'select') {
      const sorted = Array.from(state.elements.values()).sort((a, b) => b.zIndex - a.zIndex)
      const hit = sorted.find(el => hitTest(el, pos.x, pos.y, state.view.zoom))
      if (hit) {
        const selected = state.selectedIds.has(hit.id) ? Array.from(state.selectedIds) : [hit.id]
        if (e.shiftKey) {
          const next = new Set(state.selectedIds)
          next.has(hit.id) ? next.delete(hit.id) : next.add(hit.id)
          state.setSelected(Array.from(next))
        } else state.setSelected(selected)
        const ids = Array.from(useCanvasStore.getState().selectedIds)
        const origins = Object.fromEntries(ids.map(id => {
          const el = useCanvasStore.getState().elements.get(id)!
          return [id, { x: el.x, y: el.y }]
        }))
        state.pushHistory()
        dragRef.current = { type: 'move', ids, startX: pos.x, startY: pos.y, origins }
      } else {
        state.clearSelection()
        dragRef.current = { type: 'selectBox', startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y }
      }
      return
    }

    if (state.tool === 'eraser') {
      const hit = Array.from(state.elements.values()).sort((a, b) => b.zIndex - a.zIndex).find(el => hitTest(el, pos.x, pos.y, state.view.zoom))
      if (hit) {
        state.pushHistory()
        state.deleteElement(hit.id)
        onElementDelete(hit.id)
      }
      return
    }

    state.pushHistory()
    const type = state.tool === 'comment' ? 'comment' : state.tool
    const base = state.createElement(type as CanvasElement['type'], userId, {
      roomId,
      x: pos.x,
      y: pos.y,
      width: type === 'sticky' ? 180 : type === 'text' ? 220 : type === 'comment' ? 1 : 0,
      height: type === 'sticky' ? 170 : type === 'text' ? 50 : type === 'comment' ? 1 : 0,
      text: type === 'sticky' ? 'New idea' : type === 'text' ? 'Text' : '',
      authorName: username,
    })
    if (type === 'freehand') base.points = [[pos.x, pos.y]]
    drawingRef.current = base
    state.setIsDrawing(true)
  }

  function onPointerMove(e: React.PointerEvent) {
    const pos = getCanvasPos(e)
    const state = useCanvasStore.getState()
    const now = Date.now()
    if (now - cursorThrottle.current > 35) {
      onCursorMove(pos.x, pos.y)
      cursorThrottle.current = now
    }
    if (state.tool === 'laser' && e.buttons === 1) setLaser({ x: pos.x, y: pos.y, t: now })

    if (isPanning.current && panRef.current) {
      state.setView({ x: panRef.current.viewX + e.clientX - panRef.current.startX, y: panRef.current.viewY + e.clientY - panRef.current.startY })
      return
    }
    if (dragRef.current?.type === 'move') {
      const dx = pos.x - dragRef.current.startX
      const dy = pos.y - dragRef.current.startY
      dragRef.current.ids.forEach(id => {
        const el = state.elements.get(id)
        const origin = dragRef.current?.type === 'move' ? dragRef.current.origins[id] : null
        if (el && origin) state.upsertElement({ ...el, x: origin.x + dx, y: origin.y + dy, updatedAt: now, version: el.version + 1 })
      })
      return
    }
    if (dragRef.current?.type === 'selectBox') {
      dragRef.current.currentX = pos.x
      dragRef.current.currentY = pos.y
      scheduleRender()
      return
    }
    if (!drawingRef.current || !state.isDrawing) return
    const el = drawingRef.current
    if (el.type === 'freehand') drawingRef.current = { ...el, points: [...(el.points ?? []), [pos.x, pos.y]], updatedAt: now }
    else if (el.type !== 'sticky' && el.type !== 'text' && el.type !== 'comment') drawingRef.current = { ...el, width: pos.x - el.x, height: pos.y - el.y, updatedAt: now }
    scheduleRender()
  }

  function onPointerUp() {
    const state = useCanvasStore.getState()
    isPanning.current = false
    panRef.current = null

    if (dragRef.current?.type === 'move') {
      const updates = dragRef.current.ids.map(id => state.elements.get(id)).filter(Boolean) as CanvasElement[]
      onBatchChange(updates)
      dragRef.current = null
      return
    }
    if (dragRef.current?.type === 'selectBox') {
      const box = dragRef.current
      const left = Math.min(box.startX, box.currentX)
      const right = Math.max(box.startX, box.currentX)
      const top = Math.min(box.startY, box.currentY)
      const bottom = Math.max(box.startY, box.currentY)
      const ids = Array.from(state.elements.values()).filter(el => el.x >= left && el.x + (el.width ?? 1) <= right && el.y >= top && el.y + (el.height ?? 1) <= bottom).map(el => el.id)
      state.setSelected(ids)
      dragRef.current = null
      return
    }

    if (drawingRef.current && state.isDrawing) {
      const el = normalizeElement(drawingRef.current)
      drawingRef.current = null
      state.setIsDrawing(false)
      state.upsertElement(el)
      onElementChange(el)
      state.setSelected([el.id])
      if (el.type === 'sticky' || el.type === 'text') setTimeout(() => startTextEdit(el), 40)
      if (el.type === 'comment') {
        onCommentCreate?.({ id: nanoid(10), roomId, x: el.x, y: el.y, body: 'Review this area' })
      }
      state.setTool('select')
    }
  }

  function normalizeElement(el: CanvasElement) {
    let finalEl = { ...el, updatedAt: Date.now(), version: el.version + 1 }
    if (['rect', 'ellipse', 'arrow', 'line'].includes(el.type) && el.width !== undefined && el.height !== undefined) {
      if (el.width < 0) { finalEl.x = el.x + el.width; finalEl.width = Math.abs(el.width) }
      if (el.height < 0 && (el.type === 'rect' || el.type === 'ellipse')) { finalEl.y = el.y + el.height; finalEl.height = Math.abs(el.height) }
    }
    if (el.type === 'freehand') {
      const bounds = getFreehandBounds(el)
      finalEl.width = bounds.w
      finalEl.height = bounds.h
    }
    if ((finalEl.type === 'rect' || finalEl.type === 'ellipse') && Math.abs(finalEl.width ?? 0) < 4 && Math.abs(finalEl.height ?? 0) < 4) {
      finalEl.width = 120
      finalEl.height = 72
    }
    return finalEl
  }

  function onDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    const pos = screenToCanvas(e.clientX - rect.left, e.clientY - rect.top, useCanvasStore.getState().view)
    const state = useCanvasStore.getState()
    const hit = Array.from(state.elements.values()).sort((a, b) => b.zIndex - a.zIndex).find(el => hitTest(el, pos.x, pos.y, state.view.zoom))
    if (hit && (hit.type === 'sticky' || hit.type === 'text')) startTextEdit(hit)
  }

  const canvasWidth = containerRef.current?.clientWidth ?? 1
  const canvasHeight = containerRef.current?.clientHeight ?? 1

  return (
    <div ref={containerRef} className={styles.container}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ cursor: store.tool === 'pan' ? 'grab' : store.tool === 'select' ? 'default' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      />
      <div className={styles.minimap} aria-hidden="true">
        <div className={styles.minimapTitle}>Map</div>
        {Array.from(store.elements.values()).slice(0, 80).map(el => (
          <span key={el.id} className={styles.minimapItem} style={{
            left: `${Math.max(4, Math.min(92, 50 + el.x / 28))}%`,
            top: `${Math.max(12, Math.min(84, 50 + el.y / 28))}%`,
            width: `${Math.max(4, Math.min(24, (el.width ?? 30) / 18))}%`,
            height: `${Math.max(3, Math.min(18, (el.height ?? 20) / 18))}%`,
            background: el.color === 'transparent' ? el.strokeColor : el.color,
          }} />
        ))}
        <span className={styles.viewportRect} style={{
          left: `${Math.max(0, Math.min(82, 50 - store.view.x / 34))}%`,
          top: `${Math.max(10, Math.min(78, 50 - store.view.y / 34))}%`,
          width: `${Math.max(12, Math.min(80, canvasWidth / 28 / store.view.zoom))}%`,
          height: `${Math.max(10, Math.min(70, canvasHeight / 30 / store.view.zoom))}%`,
        }} />
      </div>
      <div className={styles.zoomBadge}>
        <button onClick={() => store.zoomTo(store.view.zoom - 0.1)}>-</button>
        <span>{Math.round(store.view.zoom * 100)}%</span>
        <button onClick={() => store.zoomTo(store.view.zoom + 0.1)}>+</button>
        <button onClick={() => store.resetView()}>Reset</button>
        <button onClick={() => store.fitToContent(canvasWidth, canvasHeight)}>Fit</button>
      </div>
    </div>
  )
}

function drawSelectionBox(ctx: CanvasRenderingContext2D, box: Extract<DragMode, { type: 'selectBox' }>) {
  const x = Math.min(box.startX, box.currentX)
  const y = Math.min(box.startY, box.currentY)
  const w = Math.abs(box.currentX - box.startX)
  const h = Math.abs(box.currentY - box.startY)
  ctx.fillStyle = 'rgba(37, 99, 235, 0.08)'
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.8)'
  ctx.setLineDash([6, 4])
  ctx.fillRect(x, y, w, h)
  ctx.strokeRect(x, y, w, h)
  ctx.setLineDash([])
}

function drawCursor(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, name: string, tool: string) {
  ctx.save()
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + 14, y + 18)
  ctx.lineTo(x + 6, y + 15)
  ctx.lineTo(x + 3, y + 22)
  ctx.closePath()
  ctx.fill()
  ctx.font = '11px DM Sans, sans-serif'
  const label = `${name} - ${tool}`
  const w = ctx.measureText(label).width + 12
  ctx.fillRect(x + 14, y + 18, w, 20)
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.fillText(label, x + 20, y + 28)
  ctx.restore()
}

function drawLaser(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save()
  const gradient = ctx.createRadialGradient(x, y, 2, x, y, 36)
  gradient.addColorStop(0, 'rgba(239,68,68,0.9)')
  gradient.addColorStop(1, 'rgba(239,68,68,0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(x, y, 36, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(x, y, 7, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}
