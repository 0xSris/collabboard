import type { CanvasElement } from '../store/canvasStore'

export function renderElement(ctx: CanvasRenderingContext2D, el: CanvasElement, selected = false): void {
  ctx.save()
  ctx.globalAlpha = el.opacity ?? 1

  // Transform
  if (el.rotation) {
    const cx = el.x + (el.width ?? 0) / 2
    const cy = el.y + (el.height ?? 0) / 2
    ctx.translate(cx, cy)
    ctx.rotate((el.rotation * Math.PI) / 180)
    ctx.translate(-cx, -cy)
  }

  ctx.strokeStyle = el.strokeColor
  ctx.lineWidth = el.strokeWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const fill = el.color === 'transparent' || !el.color ? false : el.color
  if (fill) ctx.fillStyle = fill

  switch (el.type) {
    case 'rect':
      drawRect(ctx, el, !!fill)
      break
    case 'ellipse':
      drawEllipse(ctx, el, !!fill)
      break
    case 'arrow':
      drawArrow(ctx, el)
      break
    case 'freehand':
      drawFreehand(ctx, el)
      break
    case 'sticky':
      drawSticky(ctx, el)
      break
    case 'text':
      drawText(ctx, el)
      break
  }

  // Selection outline
  if (selected) {
    ctx.strokeStyle = 'rgba(232,232,232,0.9)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 3])
    const pad = 6
    if (el.type === 'ellipse') {
      ctx.beginPath()
      ctx.ellipse(
        el.x + (el.width ?? 0) / 2,
        el.y + (el.height ?? 0) / 2,
        (el.width ?? 0) / 2 + pad,
        (el.height ?? 0) / 2 + pad,
        0, 0, Math.PI * 2
      )
      ctx.stroke()
    } else if (el.type === 'freehand') {
      const bounds = getFreehandBounds(el)
      ctx.strokeRect(bounds.x - pad, bounds.y - pad, bounds.w + pad * 2, bounds.h + pad * 2)
    } else {
      ctx.strokeRect(el.x - pad, el.y - pad, (el.width ?? 0) + pad * 2, (el.height ?? 0) + pad * 2)
    }
    ctx.setLineDash([])

    // Handles
    if (el.type !== 'freehand' && el.type !== 'arrow') {
      drawSelectionHandles(ctx, el)
    }
  }

  ctx.restore()
}

function drawRect(ctx: CanvasRenderingContext2D, el: CanvasElement, fill: boolean) {
  const r = 4
  const w = el.width ?? 120
  const h = el.height ?? 80
  ctx.beginPath()
  ctx.moveTo(el.x + r, el.y)
  ctx.lineTo(el.x + w - r, el.y)
  ctx.quadraticCurveTo(el.x + w, el.y, el.x + w, el.y + r)
  ctx.lineTo(el.x + w, el.y + h - r)
  ctx.quadraticCurveTo(el.x + w, el.y + h, el.x + w - r, el.y + h)
  ctx.lineTo(el.x + r, el.y + h)
  ctx.quadraticCurveTo(el.x, el.y + h, el.x, el.y + h - r)
  ctx.lineTo(el.x, el.y + r)
  ctx.quadraticCurveTo(el.x, el.y, el.x + r, el.y)
  ctx.closePath()
  if (fill) ctx.fill()
  ctx.stroke()
}

function drawEllipse(ctx: CanvasRenderingContext2D, el: CanvasElement, fill: boolean) {
  const w = el.width ?? 100
  const h = el.height ?? 80
  ctx.beginPath()
  ctx.ellipse(el.x + w / 2, el.y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  if (fill) ctx.fill()
  ctx.stroke()
}

function drawArrow(ctx: CanvasRenderingContext2D, el: CanvasElement) {
  const x2 = el.x + (el.width ?? 100)
  const y2 = el.y + (el.height ?? 0)
  const angle = Math.atan2(y2 - el.y, x2 - el.x)
  const headLen = Math.max(12, el.strokeWidth * 4)

  ctx.beginPath()
  ctx.moveTo(el.x, el.y)
  ctx.lineTo(x2, y2)
  ctx.stroke()

  // Arrowhead
  ctx.beginPath()
  ctx.moveTo(x2, y2)
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6)
  )
  ctx.moveTo(x2, y2)
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6)
  )
  ctx.stroke()
}

function drawFreehand(ctx: CanvasRenderingContext2D, el: CanvasElement) {
  const pts = el.points
  if (!pts || pts.length < 2) return
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2
    const my = (pts[i][1] + pts[i + 1][1]) / 2
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my)
  }
  const last = pts[pts.length - 1]
  ctx.lineTo(last[0], last[1])
  ctx.stroke()
}

function drawSticky(ctx: CanvasRenderingContext2D, el: CanvasElement) {
  const w = el.width ?? 160
  const h = el.height ?? 160
  const bg = el.color || '#2a2a1e'

  // Shadow
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 12
  ctx.shadowOffsetY = 4

  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.rect(el.x, el.y, w, h)
  ctx.fill()

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Top bar
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fillRect(el.x, el.y, w, 28)

  // Text
  const text = el.text || ''
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.font = `${el.fontSize ?? 13}px DM Sans, sans-serif`
  ctx.textBaseline = 'top'

  const padding = 10
  const maxWidth = w - padding * 2
  const lineHeight = (el.fontSize ?? 13) * 1.5
  const words = text.split(' ')
  let line = ''
  let y = el.y + 36

  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, el.x + padding, y)
      line = word
      y += lineHeight
      if (y > el.y + h - padding) break
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, el.x + padding, y)
}

function drawText(ctx: CanvasRenderingContext2D, el: CanvasElement) {
  const text = el.text || 'Text'
  ctx.fillStyle = el.strokeColor
  ctx.font = `${el.fontSize ?? 16}px DM Sans, sans-serif`
  ctx.textBaseline = 'top'

  const padding = 4
  const maxWidth = (el.width ?? 200) - padding * 2
  const lineHeight = (el.fontSize ?? 16) * 1.5
  const words = text.split(' ')
  let line = ''
  let y = el.y + padding

  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, el.x + padding, y)
      line = word
      y += lineHeight
    } else {
      line = test
    }
  }
  if (line) ctx.fillText(line, el.x + padding, y)
}

function drawSelectionHandles(ctx: CanvasRenderingContext2D, el: CanvasElement) {
  const handles = getHandles(el)
  ctx.fillStyle = '#0a0a0a'
  ctx.strokeStyle = 'rgba(232,232,232,0.8)'
  ctx.lineWidth = 1.5

  handles.forEach(([hx, hy]) => {
    ctx.beginPath()
    ctx.arc(hx, hy, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  })
}

export function getHandles(el: CanvasElement): [number, number][] {
  const { x, y, width: w = 0, height: h = 0 } = el
  return [
    [x, y], [x + w / 2, y], [x + w, y],
    [x + w, y + h / 2],
    [x + w, y + h], [x + w / 2, y + h], [x, y + h],
    [x, y + h / 2],
  ]
}

export function getFreehandBounds(el: CanvasElement) {
  const pts = el.points ?? []
  if (!pts.length) return { x: el.x, y: el.y, w: 0, h: 0 }
  const xs = pts.map(p => p[0])
  const ys = pts.map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs)
  const minY = Math.min(...ys), maxY = Math.max(...ys)
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function hitTest(el: CanvasElement, px: number, py: number, zoom = 1): boolean {
  const pad = 8 / zoom
  switch (el.type) {
    case 'freehand': {
      const pts = el.points ?? []
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]) < 8 / zoom) return true
      }
      return false
    }
    case 'ellipse': {
      const cx = el.x + (el.width ?? 0) / 2
      const cy = el.y + (el.height ?? 0) / 2
      const a = (el.width ?? 0) / 2 + pad
      const b = (el.height ?? 0) / 2 + pad
      return ((px - cx) ** 2) / a ** 2 + ((py - cy) ** 2) / b ** 2 <= 1
    }
    case 'arrow': {
      const x2 = el.x + (el.width ?? 0)
      const y2 = el.y + (el.height ?? 0)
      return distToSegment(px, py, el.x, el.y, x2, y2) < 10 / zoom
    }
    default:
      return (
        px >= el.x - pad && px <= el.x + (el.width ?? 0) + pad &&
        py >= el.y - pad && py <= el.y + (el.height ?? 0) + pad
      )
  }
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

export function screenToCanvas(sx: number, sy: number, view: { x: number; y: number; zoom: number }) {
  return {
    x: (sx - view.x) / view.zoom,
    y: (sy - view.y) / view.zoom,
  }
}

export function canvasToScreen(cx: number, cy: number, view: { x: number; y: number; zoom: number }) {
  return {
    x: cx * view.zoom + view.x,
    y: cy * view.zoom + view.y,
  }
}

export function renderGrid(ctx: CanvasRenderingContext2D, view: { x: number; y: number; zoom: number }, w: number, h: number) {
  const baseSize = 24
  const size = baseSize * view.zoom
  if (size < 8) return

  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1

  const startX = (view.x % size) - size
  const startY = (view.y % size) - size

  ctx.beginPath()
  for (let x = startX; x < w + size; x += size) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
  }
  for (let y = startY; y < h + size; y += size) {
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
  }
  ctx.stroke()

  // Dot at intersections for major grid
  if (view.zoom > 0.5) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    const majorSize = size * 4
    const mStartX = (view.x % majorSize) - majorSize
    const mStartY = (view.y % majorSize) - majorSize
    for (let x = mStartX; x < w + majorSize; x += majorSize) {
      for (let y = mStartY; y < h + majorSize; y += majorSize) {
        ctx.beginPath()
        ctx.arc(x, y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
}
