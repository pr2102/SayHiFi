import { LogIn, Phone } from 'lucide-react'
import { useState } from 'react'
import { firebaseReady, missingFirebaseKeys } from '../lib/firebase'
import {
  confirmPhoneOtp,
  friendlyAuthError,
  sendPhoneOtp,
  setupRecaptcha,
  signInWithGoogle,
} from '../services/authService'

export default function Login() {
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [confirmation, setConfirmation] = useState(null)
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
            Use `.env.example` as the template. Once configured, this screen becomes the Google and phone login flow.
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

  async function submitPhone(event) {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      if (!phone.trim().startsWith('+')) {
        throw new Error('Enter the phone number in international format, for example +15551234567.')
      }

      setupRecaptcha('recaptcha-container')
      const result = await sendPhoneOtp(phone)
      setConfirmation(result)
    } catch (nextError) {
      setError(friendlyAuthError(nextError))
    } finally {
      setBusy(false)
    }
  }

  async function submitCode(event) {
    event.preventDefault()
    setBusy(true)
    setError('')

    try {
      await confirmPhoneOtp(confirmation, code)
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

        <form className="auth-form" onSubmit={confirmation ? submitCode : submitPhone}>
          {!confirmation ? (
            <label>
              Phone number
              <input
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+15551234567"
                type="tel"
                value={phone}
              />
            </label>
          ) : (
            <label>
              Verification code
              <input
                onChange={(event) => setCode(event.target.value)}
                placeholder="123456"
                type="text"
                value={code}
              />
            </label>
          )}

          <button className="secondary-btn" disabled={busy} type="submit">
            <Phone size={18} />
            {confirmation ? 'Verify code' : 'Send OTP'}
          </button>
        </form>

        {error && <p className="error-text">{error}</p>}
        <div id="recaptcha-container" />
      </section>
    </main>
  )
}
