import { useCanvasStore } from '../../store/canvasStore'
import styles from './LayersPanel.module.css'
import { useState } from 'react'

export function LayersPanel() {
  const store = useCanvasStore()
  const [expanded, setExpanded] = useState(false)

  const sortedElements = Array.from(store.elements.values())
    .sort((a, b) => b.zIndex - a.zIndex)

  const toggleVisibility = (id: string) => {
    const el = store.elements.get(id)
    if (el) {
      store.updateElement(id, { opacity: el.opacity === 0 ? 1 : 0 })
    }
  }

  const selectLayer = (id: string) => {
    store.setSelected([id])
  }

  const deleteLayer = (id: string) => {
    store.deleteElement(id)
  }

  if (!expanded) {
    return (
      <button
        className={styles.toggleBtn}
        onClick={() => setExpanded(true)}
        title="Layers"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="2" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="2" y="6.5" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.5"/>
          <rect x="2" y="11" width="12" height="3" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        </svg>
      </button>
    )
  }

  return (
    <div className={styles.layersPanel}>
      <div className={styles.header}>
        <h3>Layers ({sortedElements.length})</h3>
        <button onClick={() => setExpanded(false)} className={styles.closeBtn}>×</button>
      </div>

      <div className={styles.layersList}>
        {sortedElements.length === 0 ? (
          <div className={styles.empty}>No elements</div>
        ) : (
          sortedElements.map((el) => (
            <div
              key={el.id}
              className={styles.layerItem}
              data-selected={store.selectedIds.has(el.id)}
              onClick={() => selectLayer(el.id)}
            >
              <button
                className={styles.visibilityBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleVisibility(el.id)
                }}
                title={el.opacity === 0 ? 'Show' : 'Hide'}
              >
                {el.opacity === 0 ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 10C9.2 10 11 8.2 11 6C11 3.8 9.2 2 7 2C4.8 2 3 3.8 3 6C3 8.2 4.8 10 7 10Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                    <circle cx="7" cy="6" r="1.5" fill="currentColor"/>
                    <line x1="2" y1="10" x2="12" y2="2" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M7 10C9.2 10 11 8.2 11 6C11 3.8 9.2 2 7 2C4.8 2 3 3.8 3 6C3 8.2 4.8 10 7 10Z" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
                    <circle cx="7" cy="6" r="1.5" fill="currentColor"/>
                  </svg>
                )}
              </button>

              <div className={styles.layerInfo}>
                <span className={styles.layerLabel}>
                  {el.type === 'text' ? (el.text?.substring(0, 20) || 'Text') : el.type}
                </span>
                <span className={styles.layerZIndex}>z:{el.zIndex}</span>
              </div>

              <button
                className={styles.deleteBtn}
                onClick={(e) => {
                  e.stopPropagation()
                  deleteLayer(el.id)
                }}
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
