import { LogIn } from 'lucide-react'
import { useState } from 'react'
import { firebaseReady, missingFirebaseKeys } from '../lib/firebase'
import {
  friendlyAuthError,
  signInWithGoogle,
} from '../services/authService'

export default function Login() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!firebaseReady) {
    return (
      <main className="login-screen">
        <section className="login-panel">
          <div>
            <span className="brand-mark">S</span>
            <h1>SayHiFi</h1>
            <p>Firebase is not configured yet. Add these values in a local `.env` file, then restart Vite.</p>
          </div>

          <div className="setup-box">
            {missingFirebaseKeys.map((key) => (
              <code key={key}>{key}</code>
            ))}
          </div>

          <p className="setup-note">
            Use `.env.example` as the template. Once configured, this screen becomes the Google login flow.
          </p>
        </section>
      </main>
    )
  }

  async function submitGoogle() {
    setBusy(true)
    setError('')

    try {
      await signInWithGoogle()
    } catch (nextError) {
      setError(friendlyAuthError(nextError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-panel">
        <div>
          <span className="brand-mark">S</span>
          <h1>SayHiFi</h1>
          <p>Private real-time chats, media sharing, and WebRTC calls powered by Firebase.</p>
        </div>

        <button className="primary-btn" disabled={busy} onClick={submitGoogle} type="button">
          <LogIn size={18} />
          Continue with Google
        </button>

        {error && <p className="error-text">{error}</p>}
      </section>
    </main>
  )
}
