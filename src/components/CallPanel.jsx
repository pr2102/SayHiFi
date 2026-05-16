import { Mic, Phone, PhoneOff, Video } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { answerCall, endCall, listenIncomingCalls, startCall } from '../services/callService'

export default function CallPanel({ chat, currentUserId }) {
  const [activeCallId, setActiveCallId] = useState('')
  const [incomingCall, setIncomingCall] = useState(null)
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState('Idle')
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)

  const peerId = chat?.members?.find((member) => member !== currentUserId)

  useEffect(() => {
    if (!currentUserId || !chat?.id) return undefined
    return listenIncomingCalls(currentUserId, chat.id, setIncomingCall)
  }, [chat?.id, currentUserId])

  function stopMedia() {
    session?.localStream?.getTracks().forEach((track) => track.stop())
    session?.peerConnection?.close()
    session?.cleanup?.()
    setSession(null)
    setActiveCallId('')
    setStatus('Idle')
  }

  async function handleStart(audioOnly) {
    if (!chat || !peerId) return
    const callId = `${chat.id}_${Date.now()}`
    setActiveCallId(callId)
    setStatus(audioOnly ? 'Starting audio call' : 'Starting video call')

    const nextSession = await startCall({
      callId,
      chatId: chat.id,
      callerId: currentUserId,
      receiverId: peerId,
      localVideoRef,
      remoteVideoRef,
      audioOnly,
    })

    setSession(nextSession)
    setStatus('Ringing')
  }

  async function handleAnswer() {
    if (!incomingCall) return
    setActiveCallId(incomingCall.id)
    setStatus('Connecting')

    const nextSession = await answerCall({
      callId: incomingCall.id,
      localVideoRef,
      remoteVideoRef,
    })

    setSession(nextSession)
    setIncomingCall(null)
    setStatus('Active')
  }

  async function handleEnd() {
    if (activeCallId) await endCall(activeCallId)
    stopMedia()
  }

  return (
    <section className={`call-panel ${session ? 'call-panel-active' : ''}`}>
      {incomingCall && (
        <div className="incoming-call">
          <span>Incoming {incomingCall.audioOnly ? 'audio' : 'video'} call</span>
          <button className="icon-btn success" onClick={handleAnswer} type="button" title="Answer call">
            <Phone size={18} />
          </button>
        </div>
      )}

      {session && (
        <div className="call-video-grid">
          <video ref={remoteVideoRef} autoPlay playsInline />
          <video ref={localVideoRef} autoPlay muted playsInline />
        </div>
      )}

      <div className="call-actions">
        <span>{status}</span>
        <button className="icon-btn" onClick={() => handleStart(true)} type="button" title="Audio call">
          <Mic size={18} />
        </button>
        <button className="icon-btn" onClick={() => handleStart(false)} type="button" title="Video call">
          <Video size={18} />
        </button>
        <button className="icon-btn danger" onClick={handleEnd} type="button" title="End call">
          <PhoneOff size={18} />
        </button>
      </div>
    </section>
  )
}
