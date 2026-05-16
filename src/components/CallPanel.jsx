import { Mic, Phone, PhoneOff, Video } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { answerCall, endCall, listenIncomingCalls, startCall } from '../services/callService'

export default function CallPanel({ chat, currentUserId }) {
  const [activeCallId, setActiveCallId] = useState('')
  const [incomingCall, setIncomingCall] = useState(null)
  const [session, setSession] = useState(null)
  const [status, setStatus] = useState('Idle')
  const sessionRef = useRef(null)
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const remoteAudioRef = useRef(null)

  const peerId = chat?.members?.find((member) => member !== currentUserId)

  useEffect(() => {
    if (!currentUserId || !chat?.id) return undefined
    return listenIncomingCalls(currentUserId, chat.id, setIncomingCall, (error) => {
      setStatus(error?.message || 'Could not listen for calls')
    })
  }, [chat?.id, currentUserId])

  useEffect(() => {
    sessionRef.current = session
    if (!session) return

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = session.localStream
    }

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = session.remoteStream
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = session.remoteStream
    }
  }, [session])

  function stopMedia() {
    const activeSession = sessionRef.current
    activeSession?.localStream?.getTracks().forEach((track) => track.stop())
    activeSession?.remoteStream?.getTracks().forEach((track) => track.stop())
    activeSession?.peerConnection?.close()
    activeSession?.cleanup?.()
    sessionRef.current = null
    setSession(null)
    setActiveCallId('')
    setStatus('Idle')
  }

  async function handleStart(audioOnly) {
    if (!chat || !peerId) return
    const callId = `${chat.id}_${Date.now()}`
    setActiveCallId(callId)
    setStatus(audioOnly ? 'Starting audio call' : 'Starting video call')

    try {
      const nextSession = await startCall({
        callId,
        chatId: chat.id,
        callerId: currentUserId,
        receiverId: peerId,
        audioOnly,
        onCallStatus: (nextStatus) => {
          setStatus(
            nextStatus === 'active'
              ? 'Active'
              : nextStatus === 'connected'
                ? 'Connected'
                : nextStatus === 'failed'
                  ? 'Connection failed'
                  : nextStatus === 'ended'
                    ? 'Call ended'
                    : 'Ringing',
          )
          if (nextStatus === 'ended') stopMedia()
        },
        onCallError: (error) => {
          setStatus(error?.message || 'Call signaling failed')
        },
      })

      setSession(nextSession)
      setStatus('Ringing')
    } catch (error) {
      setStatus(error?.message || 'Could not start call')
      setActiveCallId('')
    }
  }

  async function handleAnswer() {
    if (!incomingCall) return
    setActiveCallId(incomingCall.id)
    setStatus('Connecting')

    try {
      const nextSession = await answerCall({
        callId: incomingCall.id,
        onCallStatus: (nextStatus) => {
          setStatus(
            nextStatus === 'connected'
              ? 'Connected'
              : nextStatus === 'failed'
                ? 'Connection failed'
                : nextStatus === 'ended'
                  ? 'Call ended'
                  : 'Active',
          )
          if (nextStatus === 'ended') stopMedia()
        },
        onCallError: (error) => {
          setStatus(error?.message || 'Call signaling failed')
        },
      })

      setSession(nextSession)
      setIncomingCall(null)
      setStatus('Active')
    } catch (error) {
      setStatus(error?.message || 'Could not answer call')
      setActiveCallId('')
    }
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

      {session?.audioOnly && <audio ref={remoteAudioRef} autoPlay playsInline />}

      {session && !session.audioOnly && (
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
