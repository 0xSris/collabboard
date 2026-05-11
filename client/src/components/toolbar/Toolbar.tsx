import {
  MousePointer2,
  Hand,
  Square,
  Circle,
  ArrowUpRight,
  Minus,
  Pencil,
  Type,
  StickyNote,
  Eraser,
  MessageSquarePlus,
  Sparkles,
  Undo2,
  Redo2,
  Grid3X3,
} from 'lucide-react'
import { useCanvasStore, type Tool } from '../../store/canvasStore'
import { StylePanel } from './StylePanel'
import { LayersPanel } from './LayersPanel'
import styles from './Toolbar.module.css'

interface ToolDef {
  id: Tool | 'divider'
  label?: string
  shortcut?: string
  icon?: React.ReactNode
}

const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: <MousePointer2 size={17} /> },
  { id: 'pan', label: 'Pan', shortcut: 'H', icon: <Hand size={17} /> },
  { id: 'divider' },
  { id: 'rect', label: 'Rectangle', shortcut: 'R', icon: <Square size={17} /> },
  { id: 'ellipse', label: 'Ellipse', shortcut: 'E', icon: <Circle size={17} /> },
  { id: 'arrow', label: 'Arrow', shortcut: 'A', icon: <ArrowUpRight size={17} /> },
  { id: 'line', label: 'Line', shortcut: 'L', icon: <Minus size={17} /> },
  { id: 'freehand', label: 'Pen', shortcut: 'P', icon: <Pencil size={17} /> },
  { id: 'text', label: 'Text', shortcut: 'T', icon: <Type size={17} /> },
  { id: 'sticky', label: 'Sticky note', shortcut: 'S', icon: <StickyNote size={17} /> },
  { id: 'divider' },
  { id: 'comment', label: 'Comment', shortcut: 'C', icon: <MessageSquarePlus size={17} /> },
  { id: 'laser', label: 'Laser pointer', shortcut: 'K', icon: <Sparkles size={17} /> },
  { id: 'eraser', label: 'Eraser', shortcut: 'X', icon: <Eraser size={17} /> },
]

export function Toolbar() {
  const store = useCanvasStore()

  return (
    <div className={styles.toolbar}>
      {TOOLS.map((t, i) => {
        if (t.id === 'divider') return <div key={`divider-${i}`} className={styles.divider} />
        return (
          <button
            key={`${t.id}-${i}`}
            className={styles.toolBtn}
            data-active={store.tool === t.id}
            onClick={() => store.setTool(t.id as Tool)}
            title={`${t.label} (${t.shortcut})`}
          >
            {t.icon}
            <span className={styles.shortcut}>{t.label} - {t.shortcut}</span>
          </button>
        )
      })}

      <div className={styles.spacer} />

      <button className={styles.toolBtn} onClick={() => store.toggleGrid()} data-active={store.gridEnabled} title="Toggle grid">
        <Grid3X3 size={16} />
      </button>
      <button className={styles.toolBtn} onClick={() => store.undo()} disabled={store.historyIndex <= 0} title="Undo">
        <Undo2 size={16} />
      </button>
      <button className={styles.toolBtn} onClick={() => store.redo()} disabled={store.historyIndex >= store.history.length - 1} title="Redo">
        <Redo2 size={16} />
      </button>
      <StylePanel />
      <LayersPanel />
    </div>
  )
}
