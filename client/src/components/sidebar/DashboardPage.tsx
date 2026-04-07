import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import { Plus, LogOut, Download, Trash2, ArrowRight, Users, Clock } from 'lucide-react'
import styles from './DashboardPage.module.css'

interface Room {
  id: string
  name: string
  creator_name: string
  created_at: string
  updated_at: string
  member_count: number
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    api.rooms.list().then(setRooms).finally(() => setLoading(false))
  }, [])

  async function createRoom(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreating(true)
    try {
      const room = await api.rooms.create(newName.trim())
      setRooms(r => [room, ...r])
      setNewName('')
      setShowCreate(false)
      navigate(`/board/${room.id}`)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setCreating(false)
    }
  }

  async function deleteRoom(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this board? This cannot be undone.')) return
    try {
      await api.rooms.delete(id)
      setRooms(r => r.filter(room => room.id !== id))
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function exportData() {
    setExporting(true)
    try {
      const res = await api.export.me()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `collabboard-export-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert('Export failed: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  function formatDate(s: string) {
    const d = new Date(s)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days}d ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div className={styles.root}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.logo}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="11" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5"/>
              <rect x="1" y="11" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5"/>
              <rect x="11" y="11" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span>CollabBoard</span>
          </div>
        </div>

        <nav className={styles.nav}>
          <span className={styles.navLabel}>Boards</span>
        </nav>

        <div className={styles.sidebarBottom}>
          <button className={styles.iconBtn} onClick={exportData} disabled={exporting} title="Export data as JSON">
            <Download size={15} />
            <span>{exporting ? 'Exporting…' : 'Export data'}</span>
          </button>
          <button className={styles.iconBtn} onClick={() => { clearAuth(); navigate('/auth') }} title="Sign out">
            <LogOut size={15} />
            <span>Sign out</span>
          </button>
          <div className={styles.userChip}>
            <div className={styles.avatar} style={{ background: user?.cursorColor ?? '#6366f1' }}>
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user?.username}</span>
              <span className={styles.userEmail}>{user?.email}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <h1 className={styles.heading}>Your boards</h1>
            <p className={styles.subheading}>{rooms.length} {rooms.length === 1 ? 'board' : 'boards'}</p>
          </div>
          <button className={styles.createBtn} onClick={() => setShowCreate(true)}>
            <Plus size={15} />
            New board
          </button>
        </header>

        {/* Create modal */}
        {showCreate && (
          <div className={styles.overlay} onClick={() => setShowCreate(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
              <h2 className={styles.modalTitle}>New board</h2>
              <form onSubmit={createRoom}>
                <input
                  className={styles.modalInput}
                  placeholder="Board name…"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  autoFocus
                  maxLength={60}
                />
                <div className={styles.modalActions}>
                  <button type="button" className={styles.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
                  <button type="submit" className={styles.confirmBtn} disabled={creating || !newName.trim()}>
                    {creating ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Room grid */}
        {loading ? (
          <div className={styles.grid}>
            {[1,2,3].map(i => <div key={i} className={styles.skeleton} />)}
          </div>
        ) : rooms.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <svg width="32" height="32" viewBox="0 0 20 20" fill="none">
                <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <rect x="11" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5"/>
                <rect x="1" y="11" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5"/>
                <rect x="11" y="11" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </div>
            <p className={styles.emptyTitle}>No boards yet</p>
            <p className={styles.emptyText}>Create your first collaborative board to get started.</p>
            <button className={styles.createBtn} onClick={() => setShowCreate(true)}>
              <Plus size={14} /> New board
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {rooms.map((room, i) => (
              <div
                key={room.id}
                className={styles.card}
                style={{ animationDelay: `${i * 40}ms` }}
                onClick={() => navigate(`/board/${room.id}`)}
              >
                <div className={styles.cardCanvas}>
                  <div className={styles.canvasPreview}>
                    <div className={styles.previewDot} style={{ left: '20%', top: '30%', width: 40, height: 28 }} />
                    <div className={styles.previewDot} style={{ left: '55%', top: '50%', width: 60, height: 20, borderRadius: '50%' }} />
                    <div className={styles.previewLine} style={{ left: '30%', top: '65%', width: 80 }} />
                  </div>
                </div>
                <div className={styles.cardBody}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardName}>{room.name}</h3>
                    <div className={styles.cardActions}>
                      {room.created_by === user?.id && (
                        <button
                          className={styles.deleteBtn}
                          onClick={(e) => deleteRoom(room.id, e)}
                          title="Delete board"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      <ArrowRight size={14} className={styles.arrow} />
                    </div>
                  </div>
                  <div className={styles.cardMeta}>
                    <span className={styles.metaItem}>
                      <Users size={11} />
                      {room.member_count}
                    </span>
                    <span className={styles.metaItem}>
                      <Clock size={11} />
                      {formatDate(room.updated_at)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
