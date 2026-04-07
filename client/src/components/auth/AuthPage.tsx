import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import styles from './AuthPage.module.css'

export function AuthPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState({ email: '', username: '', password: '' })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields(f => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      let res
      if (mode === 'register') {
        res = await api.auth.register(fields.email, fields.username, fields.password)
      } else {
        res = await api.auth.login(fields.email, fields.password)
      }
      setAuth(res.user, res.token)
      navigate('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.bg} />

      <div className={styles.card} data-animate>
        <header className={styles.header}>
          <div className={styles.logo}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="1" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="11" y="1" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5"/>
              <rect x="1" y="11" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.5"/>
              <rect x="11" y="11" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <span>CollabBoard</span>
          </div>
          <p className={styles.tagline}>
            {mode === 'login' ? 'Welcome back.' : 'Create an account.'}
          </p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label}>Email</label>
            <input
              className={styles.input}
              type="email"
              placeholder="you@example.com"
              value={fields.email}
              onChange={set('email')}
              required
              autoFocus
            />
          </div>

          {mode === 'register' && (
            <div className={styles.field}>
              <label className={styles.label}>Username</label>
              <input
                className={styles.input}
                type="text"
                placeholder="yourname"
                value={fields.username}
                onChange={set('username')}
                required
                minLength={2}
                maxLength={32}
              />
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Password</label>
            <input
              className={styles.input}
              type="password"
              placeholder={mode === 'register' ? 'min. 6 characters' : '••••••••'}
              value={fields.password}
              onChange={set('password')}
              required
              minLength={6}
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.submit} type="submit" disabled={loading}>
            {loading ? (
              <span className={styles.spinner} />
            ) : (
              mode === 'login' ? 'Sign in' : 'Create account'
            )}
          </button>
        </form>

        <footer className={styles.footer}>
          <span className={styles.footerText}>
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
          </span>
          <button
            className={styles.switch}
            onClick={() => { setMode(m => m === 'login' ? 'register' : 'login'); setError(null) }}
          >
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </footer>
      </div>
    </div>
  )
}
