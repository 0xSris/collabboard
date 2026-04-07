import { useCanvasStore } from '../../store/canvasStore'
import styles from './StylePanel.module.css'
import { useState } from 'react'

const COLORS = [
  '#e8e8e8', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f59e0b', '#10b981', '#06b6d4', '#0ea5e9', '#3b82f6',
]

const GRADIENTS = [
  'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
  'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
  'linear-gradient(135deg, #10b981 0%, #14b8a6 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef6820 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #0ea5e9 100%)',
]

const STROKE_PATTERNS = ['solid', 'dashed', 'dotted']

export function StylePanel() {
  const store = useCanvasStore()
  const [expanded, setExpanded] = useState(false)
  
  const selectedElement = Array.from(store.elements.values()).find(
    el => store.selectedIds.has(el.id)
  )

  if (!selectedElement || !expanded) {
    return (
      <button
        className={styles.toggleBtn}
        onClick={() => setExpanded(!expanded)}
        title="Style Options"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="5" cy="7" r="1.5" fill="currentColor"/>
          <path d="M10 9L12 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    )
  }

  return (
    <div className={styles.stylePanel}>
      <div className={styles.header}>
        <h3>Style Options</h3>
        <button onClick={() => setExpanded(false)} className={styles.closeBtn}>×</button>
      </div>

      {/* Fill Color */}
      <div className={styles.section}>
        <label>Fill</label>
        <div className={styles.colorGrid}>
          {COLORS.map(color => (
            <button
              key={color}
              className={styles.colorBtn}
              style={{ backgroundColor: color }}
              onClick={() => {
                store.updateElement(selectedElement.id, {
                  color: color,
                })
              }}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Stroke Color */}
      <div className={styles.section}>
        <label>Stroke</label>
        <div className={styles.colorGrid}>
          {COLORS.map(color => (
            <button
              key={`stroke-${color}`}
              className={styles.colorBtn}
              style={{ backgroundColor: color }}
              onClick={() => {
                store.updateElement(selectedElement.id, {
                  strokeColor: color,
                })
              }}
              title={color}
            />
          ))}
        </div>
      </div>

      {/* Stroke Width */}
      <div className={styles.section}>
        <label>Stroke Width</label>
        <input
          type="range"
          min="1"
          max="8"
          value={selectedElement.strokeWidth || 2}
          onChange={(e) => {
            store.updateElement(selectedElement.id, {
              strokeWidth: parseInt(e.target.value),
            })
          }}
          className={styles.slider}
        />
        <span className={styles.value}>{selectedElement.strokeWidth || 2}px</span>
      </div>

      {/* Opacity */}
      <div className={styles.section}>
        <label>Opacity</label>
        <input
          type="range"
          min="0"
          max="100"
          value={selectedElement.opacity !== undefined ? selectedElement.opacity * 100 : 100}
          onChange={(e) => {
            store.updateElement(selectedElement.id, {
              opacity: parseInt(e.target.value) / 100,
            })
          }}
          className={styles.slider}
        />
        <span className={styles.value}>{Math.round((selectedElement.opacity || 1) * 100)}%</span>
      </div>
    </div>
  )
}
