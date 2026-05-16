import { LocalNotifications } from '@capacitor/local-notifications'
import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { arrayUnion, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, firebaseReady } from '../lib/firebase'

let pushListenersRegistered = false

export async function requestLocalNotificationPermission() {
  if (!Capacitor.isNativePlatform()) {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }
    return
  }

  const permission = await LocalNotifications.requestPermissions()

  if (permission.display === 'granted') {
    await LocalNotifications.createChannel({
      id: 'chat-messages',
      name: 'Chat messages',
      description: 'Incoming SayHiFi message notifications',
      importance: 4,
      sound: 'default',
      visibility: 1,
      vibration: true,
    }).catch(() => {})
  }
}

export async function showMessageNotification({ title, body }) {
  if (Capacitor.isNativePlatform()) {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 2147483647,
          title,
          body,
          channelId: 'chat-messages',
          sound: 'default',
        },
      ],
    })
    return
  }

  if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
    new Notification(title, { body })
  }
}

export async function registerPushNotifications(user) {
  if (!firebaseReady || !user || !Capacitor.isNativePlatform()) return

  await requestLocalNotificationPermission()

  let permission = await PushNotifications.checkPermissions()
  if (permission.receive === 'prompt') {
    permission = await PushNotifications.requestPermissions()
  }

  if (permission.receive !== 'granted') return

  if (!pushListenersRegistered) {
    PushNotifications.addListener('registration', async (token) => {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          pushTokens: arrayUnion(token.value),
          pushTokenUpdatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    })

    PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      await showMessageNotification({
        title: notification.title || 'SayHiFi',
        body: notification.body || 'New message',
      })
    })

    pushListenersRegistered = true
  }

  await PushNotifications.register()
}
