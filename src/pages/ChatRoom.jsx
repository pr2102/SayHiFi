import { ArrowLeft, Image, Mic, Send, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import ChatBubble from '../components/ChatBubble'
import CallPanel from '../components/CallPanel'
import { listenMessages, sendMessage, setTyping } from '../services/chatService'
import { friendlyMediaError, pickImageAndUpload, uploadVoiceNote } from '../services/mediaService'
import { showMessageNotification } from '../services/notificationService'
import { playReceiveSound, playSendSound, unlockNotificationAudio } from '../services/soundService'

export default function ChatRoom({ chat, user, onBack }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [mediaError, setMediaError] = useState('')
  const [mediaStatus, setMediaStatus] = useState('')
  const [recording, setRecording] = useState(false)
  const mediaRecorderRef = useRef(null)
  const recordingStreamRef = useRef(null)
  const chunksRef = useRef([])
  const messageListRef = useRef(null)
  const seenMessageIdsRef = useRef(new Set())
  const initialMessagesLoadedRef = useRef(false)

  const peerId = chat?.members?.find((member) => member !== user.uid) || user.uid
  const isSelfChat = peerId === user.uid
  const peer = chat?.memberInfo?.[peerId] || {}

  function withTimeout(promise, message, timeoutMs = 20000) {
    let timeoutId
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
    })

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
  }

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

  useEffect(() => {
    if (!messages.length) return

    requestAnimationFrame(() => {
      const messageList = messageListRef.current
      if (messageList) {
        messageList.scrollTop = messageList.scrollHeight
      }
    })
  }, [chat?.id, messages.length])

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
    setMediaError('')
    setMediaStatus('Attaching photo...')

    try {
      const mediaUrl = await pickImageAndUpload(user.uid)
      await withTimeout(
        sendMessage(chat.id, user.uid, { type: 'image', mediaUrl }),
        'Photo uploaded, but sending the chat message timed out. Check Firestore rules.',
      )
      await playSendSound()
    } catch (error) {
      const nextError = friendlyMediaError(error)
      if (nextError) setMediaError(nextError)
    } finally {
      setMediaStatus('')
    }
  }

  function getSupportedAudioMimeType() {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ]

    return types.find((type) => MediaRecorder.isTypeSupported(type)) || ''
  }

  async function startRecording() {
    await unlockNotificationAudio()
    setMediaError('')
    setMediaStatus('Recording voice note...')

    try {
      if (!window.MediaRecorder) {
        throw new Error('Audio recording is not supported on this device.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = getSupportedAudioMimeType()
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)

      recordingStreamRef.current = stream
      chunksRef.current = []
      mediaRecorder.ondataavailable = (event) => {
        if (event.data?.size) chunksRef.current.push(event.data)
      }
      mediaRecorder.onerror = (event) => {
        setMediaError(friendlyMediaError(event.error || event))
      }
      mediaRecorder.onstop = async () => {
        const audioType = mediaRecorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: audioType })

        try {
          const mediaUrl = await withTimeout(
            uploadVoiceNote(user.uid, blob),
            'Voice note upload timed out. Check Storage rules and internet connection.',
          )
          await withTimeout(
            sendMessage(chat.id, user.uid, { type: 'voice', mediaUrl }),
            'Voice note uploaded, but sending the chat message timed out. Check Firestore rules.',
          )
          await playSendSound()
        } catch (error) {
          const nextError = friendlyMediaError(error)
          if (nextError) setMediaError(nextError)
        } finally {
          stream.getTracks().forEach((track) => track.stop())
          recordingStreamRef.current = null
          mediaRecorderRef.current = null
          setMediaStatus('')
          setRecording(false)
        }
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start(1000)
      setRecording(true)
    } catch (error) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop())
      recordingStreamRef.current = null
      mediaRecorderRef.current = null
      setMediaStatus('')
      setRecording(false)
      const nextError = friendlyMediaError(error)
      if (nextError) setMediaError(nextError)
    }
  }

  function stopRecording() {
    const mediaRecorder = mediaRecorderRef.current
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return

    if (mediaRecorder.state === 'recording') {
      setMediaStatus('Sending voice note...')
      mediaRecorder.requestData()
      mediaRecorder.stop()
    }
  }

  const peerTyping = chat.typing?.[peerId]

  return (
    <main className="chat-room">
      <header className="room-header">
        <button className="mobile-back-btn" onClick={onBack} type="button" title="Back to chats">
          <ArrowLeft size={20} />
        </button>
        <span className="avatar large">{(peer.displayName || 'C').slice(0, 1).toUpperCase()}</span>
        <div>
          <h1>{peer.displayName || peer.email || peer.phoneNumber || 'Contact'}</h1>
          <p>{peerTyping ? 'typing...' : 'online when signed in'}</p>
        </div>
      </header>

      {!isSelfChat && <CallPanel chat={chat} currentUserId={user.uid} />}

      <section className="message-list" ref={messageListRef}>
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} mine={message.senderId === user.uid} />
        ))}
      </section>

      <form className="composer" onSubmit={submitMessage}>
        {mediaError && <p className="composer-error">{mediaError}</p>}
        {mediaStatus && <p className="composer-status">{mediaStatus}</p>}
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
