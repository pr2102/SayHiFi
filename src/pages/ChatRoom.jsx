import { Image, Mic, Send, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ChatBubble from '../components/ChatBubble'
import CallPanel from '../components/CallPanel'
import { listenMessages, sendMessage, setTyping } from '../services/chatService'
import { pickImageAndUpload, uploadVoiceNote } from '../services/mediaService'
import { showMessageNotification } from '../services/notificationService'
import { playReceiveSound, playSendSound, unlockNotificationAudio } from '../services/soundService'

export default function ChatRoom({ chat, user }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const seenMessageIdsRef = useRef(new Set())
  const initialMessagesLoadedRef = useRef(false)

  const peerId = chat?.members?.find((member) => member !== user.uid) || user.uid
  const isSelfChat = peerId === user.uid
  const peer = chat?.memberInfo?.[peerId] || {}

  useEffect(() => {
    if (!chat?.id) return undefined
    seenMessageIdsRef.current = new Set()
    initialMessagesLoadedRef.current = false
    return listenMessages(chat.id, setMessages)
  }, [chat?.id])

  useEffect(() => {
    const incomingMessages = messages.filter((message) => {
      const isNew = !seenMessageIdsRef.current.has(message.id)
      seenMessageIdsRef.current.add(message.id)
      return initialMessagesLoadedRef.current && isNew && message.senderId !== user.uid
    })

    if (!initialMessagesLoadedRef.current) {
      initialMessagesLoadedRef.current = true
      return
    }

    incomingMessages.forEach((message) => {
      playReceiveSound()
      showMessageNotification({
        title: peer.displayName || peer.email || 'SayHiFi',
        body: message.text || (message.type === 'image' ? 'Photo' : 'Voice note'),
      })
    })
  }, [messages, peer.displayName, peer.email, user.uid])

  useEffect(() => {
    if (!chat?.id) return undefined
    const timeout = setTimeout(() => setTyping(chat.id, user.uid, false), 900)
    return () => clearTimeout(timeout)
  }, [chat?.id, draft, user.uid])

  if (!chat) {
    return (
      <section className="room-empty">
        <h1>Select a chat</h1>
        <p>Start a conversation from the left panel to send messages, media, and calls.</p>
      </section>
    )
  }

  async function submitMessage(event) {
    event.preventDefault()
    await unlockNotificationAudio()
    if (!draft.trim()) return

    await sendMessage(chat.id, user.uid, { text: draft.trim() })
    await playSendSound()
    setDraft('')
    await setTyping(chat.id, user.uid, false)
  }

  async function handleImage() {
    await unlockNotificationAudio()
    const mediaUrl = await pickImageAndUpload(user.uid)
    await sendMessage(chat.id, user.uid, { type: 'image', mediaUrl })
    await playSendSound()
  }

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mediaRecorder = new MediaRecorder(stream)

    chunksRef.current = []
    mediaRecorder.ondataavailable = (event) => chunksRef.current.push(event.data)
    mediaRecorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const mediaUrl = await uploadVoiceNote(user.uid, blob)
      await sendMessage(chat.id, user.uid, { type: 'voice', mediaUrl })
      await playSendSound()
      stream.getTracks().forEach((track) => track.stop())
    }

    mediaRecorderRef.current = mediaRecorder
    mediaRecorder.start()
    setRecording(true)
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
    setRecording(false)
  }

  const peerTyping = chat.typing?.[peerId]

  return (
    <main className="chat-room">
      <header className="room-header">
        <span className="avatar large">{(peer.displayName || 'C').slice(0, 1).toUpperCase()}</span>
        <div>
          <h1>{peer.displayName || peer.email || peer.phoneNumber || 'Contact'}</h1>
          <p>{peerTyping ? 'typing...' : 'online when signed in'}</p>
        </div>
      </header>

      {!isSelfChat && <CallPanel chat={chat} currentUserId={user.uid} />}

      <section className="message-list">
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} mine={message.senderId === user.uid} />
        ))}
      </section>

      <form className="composer" onSubmit={submitMessage}>
        <button className="icon-btn" onClick={handleImage} type="button" title="Send image">
          <Image size={19} />
        </button>
        <button
          className={`icon-btn ${recording ? 'danger' : ''}`}
          onClick={recording ? stopRecording : startRecording}
          type="button"
          title={recording ? 'Stop recording' : 'Record voice note'}
        >
          {recording ? <Square size={18} /> : <Mic size={19} />}
        </button>
        <input
          onChange={(event) => {
            setDraft(event.target.value)
            setTyping(chat.id, user.uid, true)
          }}
          placeholder="Message"
          value={draft}
        />
        <button className="send-btn" type="submit" title="Send message">
          <Send size={19} />
        </button>
      </form>
    </main>
  )
}
