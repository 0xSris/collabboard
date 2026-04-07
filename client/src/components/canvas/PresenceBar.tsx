import { useCanvasStore } from '../../store/canvasStore'
import { useAuthStore } from '../../store/authStore'
import styles from './PresenceBar.module.css'

export function PresenceBar() {
  const presence = useCanvasStore(s => s.presence)
  const user = useAuthStore(s => s.user)

  return (
    <div className={styles.root}>
      {/* Self */}
      {user && (
        <div
          className={styles.avatar}
          style={{ background: user.cursorColor }}
          title={`${user.username} (you)`}
        >
          {user.username[0].toUpperCase()}
        </div>
      )}

      {/* Others */}
      {presence.slice(0, 8).map(p => (
        <div
          key={p.userId}
          className={styles.avatar}
          style={{ background: p.color }}
          title={p.username}
        >
          {p.username[0].toUpperCase()}
        </div>
      ))}

      {presence.length > 8 && (
        <div className={styles.overflow}>+{presence.length - 8}</div>
      )}

      {presence.length > 0 && (
        <span className={styles.count}>
          {presence.length + 1} online
        </span>
      )}
    </div>
  )
}
