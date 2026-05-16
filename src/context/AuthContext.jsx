import { onAuthStateChanged } from 'firebase/auth'
import { useEffect, useMemo, useState } from 'react'
import { auth, firebaseReady } from '../lib/firebase'
import { upsertUserProfile } from '../services/authService'
import { registerPushNotifications } from '../services/notificationService'
import { AuthContext } from './useAuth'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(firebaseReady)

  useEffect(() => {
    if (!firebaseReady) {
      return undefined
    }

    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)
      setLoading(false)

      if (nextUser) {
        upsertUserProfile(nextUser).catch((error) => {
          console.error('Unable to save user profile', error)
        })
        registerPushNotifications(nextUser).catch((error) => {
          console.error('Unable to register push notifications', error)
        })
      }
    })
  }, [])

  const value = useMemo(() => ({ user, loading }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
