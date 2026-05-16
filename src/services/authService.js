import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db, firebaseReady } from '../lib/firebase'

function assertFirebaseReady() {
  if (!firebaseReady) {
    throw new Error('Firebase is not configured. Create .env from .env.example and restart the dev server.')
  }
}

export function friendlyAuthError(error) {
  const code = error?.code || ''

  if (code === 'auth/configuration-not-found') {
    return 'Firebase Auth is not enabled for this project yet. Open Firebase Console > Authentication > Get started, then enable Google and Phone sign-in providers.'
  }

  if (code === 'auth/operation-not-allowed') {
    return 'This sign-in provider is disabled in Firebase Authentication. Enable it under Authentication > Sign-in method.'
  }

  if (code === 'auth/invalid-phone-number') {
    return 'Enter the phone number in international format, for example +15551234567.'
  }

  if (code === 'auth/popup-blocked') {
    return 'The browser blocked the Google sign-in popup. Allow popups for localhost and try again.'
  }

  if (code === 'auth/unauthorized-domain') {
    return 'localhost is not authorized in Firebase Auth. Add localhost under Authentication > Settings > Authorized domains.'
  }

  return error?.message || 'Sign-in failed. Check Firebase Authentication settings and try again.'
}

export async function upsertUserProfile(user) {
  if (!user) return
  assertFirebaseReady()

  await setDoc(
    doc(db, 'users', user.uid),
    {
      uid: user.uid,
      displayName: user.displayName || user.phoneNumber || 'SayHiFi user',
      email: user.email || '',
      phoneNumber: user.phoneNumber || '',
      photoURL: user.photoURL || '',
      lastSeen: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function signInWithGoogle() {
  assertFirebaseReady()
  const provider = new GoogleAuthProvider()
  const result = await signInWithPopup(auth, provider)
  await upsertUserProfile(result.user)
  return result.user
}

export function setupRecaptcha(containerId) {
  assertFirebaseReady()
  if (window.recaptchaVerifier) return window.recaptchaVerifier

  window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
    size: 'invisible',
  })

  return window.recaptchaVerifier
}

export function sendPhoneOtp(phoneNumber) {
  assertFirebaseReady()
  return signInWithPhoneNumber(auth, phoneNumber, window.recaptchaVerifier)
}

export async function confirmPhoneOtp(confirmationResult, code) {
  assertFirebaseReady()
  const result = await confirmationResult.confirm(code)
  await upsertUserProfile(result.user)
  return result.user
}

export function logout() {
  assertFirebaseReady()
  return signOut(auth)
}
