import { Capacitor } from '@capacitor/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithCredential,
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

  if (code === 'auth/invalid-credential' || code === 'invalid-credential') {
    return 'Google sign-in returned an invalid token. Check the Android app in Firebase and rebuild the APK.'
  }

  if (/no credentials available/i.test(error?.message || '')) {
    return 'No Google account was returned by Android. Make sure a Google account is added on the device, then try Continue with Google again.'
  }

  if (code === '10' || /developer_error|api.?exception:?\s*10/i.test(error?.message || '')) {
    return 'Google sign-in is blocked by Firebase Android setup. Add the APK signing SHA-1/SHA-256 to the Firebase Android app, download a fresh google-services.json, rebuild, and install the new APK.'
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

  if (Capacitor.isNativePlatform()) {
    const nativeResult = await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true,
      useCredentialManager: false,
    })
    const idToken = nativeResult.credential?.idToken
    const accessToken = nativeResult.credential?.accessToken

    if (!idToken && !accessToken) {
      throw new Error('Google sign-in did not return a Firebase-compatible token. Check Firebase Android SHA fingerprints and Google provider setup.')
    }

    const credential = GoogleAuthProvider.credential(
      idToken,
      accessToken,
    )
    const result = await signInWithCredential(auth, credential)
    await upsertUserProfile(result.user)
    return result.user
  }

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
  if (Capacitor.isNativePlatform()) {
    FirebaseAuthentication.signOut().catch((error) => {
      console.warn('Native sign-out failed', error)
    })
  }
  return signOut(auth)
}
