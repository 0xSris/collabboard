import { useCanvasStore, type Tool } from '../../store/canvasStore'
import { StylePanel } from './StylePanel'
import { LayersPanel } from './LayersPanel'
import styles from './Toolbar.module.css'

interface ToolDef {
  id: Tool
  label: string
  shortcut: string
  icon: React.ReactNode
}

const TOOLS: ToolDef[] = [
  {
    id: 'select', label: 'Select', shortcut: 'V',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 2L3 12L6.5 9L8.5 13.5L10 12.8L8 8.3L12 8L3 2Z" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: 'pan', label: 'Pan', shortcut: 'H',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5V4M8 12V14.5M1.5 8H4M12 8H14.5M3.5 3.5L5.5 5.5M10.5 10.5L12.5 12.5M3.5 12.5L5.5 10.5M10.5 5.5L12.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  { id: '_divider1' as any, label: '', shortcut: '', icon: null },
  {
    id: 'rect', label: 'Rectangle', shortcut: 'R',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="2" y="4" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: 'ellipse', label: 'Ellipse', shortcut: 'E',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <ellipse cx="8" cy="8" rx="6" ry="4.5" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
  {
    id: 'arrow', label: 'Arrow', shortcut: 'A',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 13L12 4M12 4H7M12 4V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'freehand', label: 'Freehand', shortcut: 'P',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 11C4 8 5 5 7 5C9 5 7 11 9 11C11 11 11 5 14 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'text', label: 'Text', shortcut: 'T',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 4H13M8 4V12M6 12H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'sticky', label: 'Sticky Note', shortcut: 'S',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 3H13V11L10 14H3V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M10 11V14L13 11H10Z" fill="currentColor"/>
        <path d="M5.5 7H10.5M5.5 9.5H8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  { id: '_divider2' as any, label: '', shortcut: '', icon: null },
  {
    id: 'eraser', label: 'Eraser', shortcut: 'X',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M11 3L14 6L7 13H4V10L11 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
        <path d="M4 13H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M9 5L12 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
]

export function Toolbar() {
  const { tool, setTool, undo, redo, history, historyIndex } = useCanvasStore()

  return (
    <div className={styles.toolbar}>
      {TOOLS.map((t, i) => {
        if ((t.id as string).startsWith('_divider')) {
          return <div key={i} className={styles.divider} />
        }
        return (
          <button
            key={t.id}
            className={styles.toolBtn}
            data-active={tool === t.id}
            onClick={() => setTool(t.id)}
            title={`${t.label} (${t.shortcut})`}
          >
            {t.icon}
            <span className={styles.shortcut}>{t.shortcut}</span>
          </button>
        )
      })}

      <div className={styles.spacer} />

      <button
        className={styles.toolBtn}
        onClick={() => undo()}
        disabled={historyIndex <= 0}
        title="Undo (Ctrl+Z)"
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M3 7C3 4.8 4.8 3 7 3C9.2 3 11 4.8 11 7C11 9.2 9.2 11 7 11H5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M2 5L4 7L2 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" transform="scale(-1,1) translate(-9,0)"/>
          <path d="M5.5 5L3 7L5.5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <button
        className={styles.toolBtn}
        onClick={() => redo()}
        disabled={historyIndex >= history.length - 1}
        title="Redo (Ctrl+Shift+Z)"
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
          <path d="M12 7C12 4.8 10.2 3 8 3C5.8 3 4 4.8 4 7C4 9.2 5.8 11 8 11H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          <path d="M9.5 5L12 7L9.5 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <StylePanel />
      <LayersPanel />
    </div>
  )
}
