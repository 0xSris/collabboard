import { useCanvasStore, type CanvasElement } from '../../store/canvasStore'
import styles from './PropertiesPanel.module.css'

const COLORS = [
  '#e8e8e8', '#a0a0a0', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#06b6d4', '#6366f1',
  '#a855f7', '#ec4899', '#2a2a1e', '#1e2a2a',
  'transparent',
]

interface Props {
  onElementChange: (el: CanvasElement) => void
}

export function PropertiesPanel({ onElementChange }: Props) {
  const { elements, selectedIds, strokeColor, fillColor, strokeWidth, fontSize, setStrokeColor, setFillColor, setStrokeWidth, setFontSize } = useCanvasStore()

  const selected = selectedIds.size === 1 ? elements.get(Array.from(selectedIds)[0]) : null

  function updateEl(patch: Partial<CanvasElement>) {
    if (!selected) return
    const updated = { ...selected, ...patch, updatedAt: Date.now() }
    useCanvasStore.getState().upsertElement(updated)
    onElementChange(updated)
  }

  if (selectedIds.size === 0) {
    // Show default style picker
    return (
      <aside className={styles.panel}>
        <section className={styles.section}>
          <p className={styles.label}>Stroke</p>
          <div className={styles.colorGrid}>
            {COLORS.filter(c => c !== 'transparent').map(c => (
              <button
                key={c}
                className={styles.colorBtn}
                style={{ background: c }}
                data-active={strokeColor === c}
                onClick={() => setStrokeColor(c)}
                title={c}
              />
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.label}>Fill</p>
          <div className={styles.colorGrid}>
            {COLORS.map(c => (
              <button
                key={c}
                className={styles.colorBtn}
                style={{ background: c === 'transparent' ? undefined : c }}
                data-transparent={c === 'transparent'}
                data-active={fillColor === c}
                onClick={() => setFillColor(c)}
                title={c === 'transparent' ? 'None' : c}
              />
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.label}>Stroke width</p>
          <div className={styles.widthBtns}>
            {[1, 2, 3, 5].map(w => (
              <button
                key={w}
                className={styles.widthBtn}
                data-active={strokeWidth === w}
                onClick={() => setStrokeWidth(w)}
              >
                <div className={styles.widthLine} style={{ height: w }} />
              </button>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.label}>Font size</p>
          <div className={styles.widthBtns}>
            {[12, 14, 18, 24].map(s => (
              <button
                key={s}
                className={styles.widthBtn}
                data-active={fontSize === s}
                onClick={() => setFontSize(s)}
              >
                <span style={{ fontSize: 11 }}>{s}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>
    )
  }

  if (!selected) return null

  return (
    <aside className={styles.panel}>
      <section className={styles.section}>
        <p className={styles.sectionTitle}>{selected.type}</p>
      </section>

      {selected.type !== 'freehand' && selected.type !== 'arrow' && (
        <section className={styles.section}>
          <p className={styles.label}>Fill</p>
          <div className={styles.colorGrid}>
            {COLORS.map(c => (
              <button
                key={c}
                className={styles.colorBtn}
                style={{ background: c === 'transparent' ? undefined : c }}
                data-transparent={c === 'transparent'}
                data-active={selected.color === c}
                onClick={() => updateEl({ color: c })}
                title={c === 'transparent' ? 'None' : c}
              />
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <p className={styles.label}>Stroke</p>
        <div className={styles.colorGrid}>
          {COLORS.filter(c => c !== 'transparent').map(c => (
            <button
              key={c}
              className={styles.colorBtn}
              style={{ background: c }}
              data-active={selected.strokeColor === c}
              onClick={() => updateEl({ strokeColor: c })}
            />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <p className={styles.label}>Width</p>
        <div className={styles.widthBtns}>
          {[1, 2, 3, 5].map(w => (
            <button
              key={w}
              className={styles.widthBtn}
              data-active={selected.strokeWidth === w}
              onClick={() => updateEl({ strokeWidth: w })}
            >
              <div className={styles.widthLine} style={{ height: w }} />
            </button>
          ))}
        </div>
      </section>

      {(selected.type === 'text' || selected.type === 'sticky') && (
        <section className={styles.section}>
          <p className={styles.label}>Font size</p>
          <div className={styles.widthBtns}>
            {[11, 13, 16, 20, 28].map(s => (
              <button
                key={s}
                className={styles.widthBtn}
                data-active={selected.fontSize === s}
                onClick={() => updateEl({ fontSize: s })}
              >
                <span style={{ fontSize: 10 }}>{s}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <p className={styles.label}>Opacity</p>
        <input
          type="range" min="0.1" max="1" step="0.05"
          value={selected.opacity ?? 1}
          onChange={e => updateEl({ opacity: parseFloat(e.target.value) })}
          className={styles.slider}
        />
        <span className={styles.sliderVal}>{Math.round((selected.opacity ?? 1) * 100)}%</span>
      </section>

      <section className={styles.section}>
        <p className={styles.label}>Position</p>
        <div className={styles.xywh}>
          {['x','y','width','height'].map(k => (
            <label key={k} className={styles.xywhlabel}>
              <span>{k}</span>
              <input
                type="number"
                value={Math.round((selected as any)[k] ?? 0)}
                onChange={e => updateEl({ [k]: parseInt(e.target.value) || 0 })}
                className={styles.xywhInput}
              />
            </label>
          ))}
        </div>
      </section>
    </aside>
  )
}
