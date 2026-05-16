import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export const chatIdFor = (uidA, uidB) => (uidA === uidB ? `${uidA}_self` : [uidA, uidB].sort().join('_'))

export async function findUserByHandle(handle) {
  const value = handle.trim()
  if (!value) return null

  const directSnap = await getDoc(doc(db, 'users', value))
  if (directSnap.exists()) return { id: directSnap.id, ...directSnap.data() }

  const field = value.includes('@') ? 'email' : 'phoneNumber'
  const userQuery = query(collection(db, 'users'), where(field, '==', value), limit(1))
  const users = await getDocs(userQuery)

  if (users.empty) return null
  const found = users.docs[0]
  return { id: found.id, ...found.data() }
}

export async function ensureChat(currentUser, peerUser) {
  const chatId = chatIdFor(currentUser.uid, peerUser.uid)
  const chatRef = doc(db, 'chats', chatId)
  const snap = await getDoc(chatRef)
  const isSelfChat = currentUser.uid === peerUser.uid

  if (!snap.exists()) {
    await setDoc(chatRef, {
      id: chatId,
      members: isSelfChat ? [currentUser.uid] : [currentUser.uid, peerUser.uid],
      memberInfo: {
        [currentUser.uid]: {
          displayName: isSelfChat ? 'Saved Messages' : currentUser.displayName || currentUser.phoneNumber || 'You',
          email: currentUser.email || '',
          phoneNumber: currentUser.phoneNumber || '',
          photoURL: currentUser.photoURL || '',
        },
        ...(!isSelfChat && {
          [peerUser.uid]: {
            displayName: peerUser.displayName || peerUser.phoneNumber || peerUser.email || 'Contact',
            email: peerUser.email || '',
            phoneNumber: peerUser.phoneNumber || '',
            photoURL: peerUser.photoURL || '',
          },
        }),
      },
      typing: {},
      lastMessage: '',
      updatedAt: serverTimestamp(),
    })
  }

  return chatId
}

export function listenChats(uid, callback) {
  const chatsQuery = query(
    collection(db, 'chats'),
    where('members', 'array-contains', uid),
  )

  return onSnapshot(chatsQuery, (snapshot) => {
    const chats = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0))

    callback(chats)
  })
}

export function listenUnreadCount(chatId, uid, callback) {
  return onSnapshot(collection(db, 'chats', chatId, 'messages'), (snapshot) => {
    const unreadCount = snapshot.docs.filter((item) => {
      const message = item.data()
      return message.senderId !== uid && !message.readBy?.includes(uid)
    }).length

    callback(unreadCount)
  })
}

export function listenMessages(chatId, callback) {
  const messagesQuery = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
  )

  return onSnapshot(messagesQuery, (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
  })
}

export async function sendMessage(chatId, senderId, payload) {
  const type = payload.type || 'text'
  const message = {
    senderId,
    type,
    text: payload.text || '',
    mediaUrl: payload.mediaUrl || '',
    status: 'sent',
    readBy: [senderId],
    createdAt: serverTimestamp(),
  }

  await addDoc(collection(db, 'chats', chatId, 'messages'), message)
  await updateDoc(doc(db, 'chats', chatId), {
    lastMessage: type === 'text' ? message.text : type,
    updatedAt: serverTimestamp(),
  })
}

export function setTyping(chatId, uid, isTyping) {
  return updateDoc(doc(db, 'chats', chatId), {
    [`typing.${uid}`]: isTyping,
  })
}

export function markMessageRead(chatId, messageId, uid) {
  return updateDoc(doc(db, 'chats', chatId, 'messages', messageId), {
    status: 'read',
    readBy: arrayUnion(uid),
  })
}

export async function markChatRead(chatId, uid) {
  const snapshot = await getDocs(collection(db, 'chats', chatId, 'messages'))
  const updates = snapshot.docs
    .filter((item) => {
      const message = item.data()
      return message.senderId !== uid && !message.readBy?.includes(uid)
    })
    .map((item) => markMessageRead(chatId, item.id, uid))

  await Promise.all(updates)
}
