import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

const rtcConfig = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
}

function createPeerSession(localStream) {
  const peerConnection = new RTCPeerConnection(rtcConfig)
  const remoteStream = new MediaStream()
  const pendingCandidates = []

  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream))

  peerConnection.ontrack = (event) => {
    const [stream] = event.streams
    if (stream) {
      stream.getTracks().forEach((track) => remoteStream.addTrack(track))
    }
  }

  async function addRemoteCandidate(candidateData) {
    if (!peerConnection.remoteDescription) {
      pendingCandidates.push(candidateData)
      return
    }

    await peerConnection.addIceCandidate(new RTCIceCandidate(candidateData))
  }

  async function flushRemoteCandidates() {
    while (pendingCandidates.length) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(pendingCandidates.shift()))
    }
  }

  return { peerConnection, remoteStream, addRemoteCandidate, flushRemoteCandidates }
}

export async function startCall({ callId, chatId, callerId, receiverId, audioOnly, onCallStatus, onCallError }) {
  const callRef = doc(db, 'calls', callId)
  const offerCandidates = collection(callRef, 'offerCandidates')
  const answerCandidates = collection(callRef, 'answerCandidates')

  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: !audioOnly,
  })

  const { peerConnection, remoteStream, addRemoteCandidate, flushRemoteCandidates } = createPeerSession(localStream)
  peerConnection.onconnectionstatechange = () => {
    onCallStatus?.(peerConnection.connectionState)
  }

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(offerCandidates, event.candidate.toJSON()).catch(onCallError)
    }
  }

  const offer = await peerConnection.createOffer()
  await peerConnection.setLocalDescription(offer)

  await setDoc(callRef, {
    chatId,
    callerId,
    receiverId,
    audioOnly,
    status: 'ringing',
    offer: { type: offer.type, sdp: offer.sdp },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  const unsubscribeCall = onSnapshot(
    callRef,
    async (snapshot) => {
      const data = snapshot.data()
      if (data?.status) onCallStatus?.(data.status)
      if (data?.answer && !peerConnection.currentRemoteDescription) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
        await flushRemoteCandidates()
      }
    },
    onCallError,
  )

  const unsubscribeCandidates = onSnapshot(
    answerCandidates,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          addRemoteCandidate(change.doc.data()).catch(onCallError)
        }
      })
    },
    onCallError,
  )

  return {
    audioOnly,
    peerConnection,
    localStream,
    remoteStream,
    cleanup: () => [unsubscribeCall, unsubscribeCandidates].forEach((fn) => fn()),
  }
}

export async function answerCall({ callId, onCallStatus, onCallError }) {
  const callRef = doc(db, 'calls', callId)
  const offerCandidates = collection(callRef, 'offerCandidates')
  const answerCandidates = collection(callRef, 'answerCandidates')
  const callSnap = await getDoc(callRef)
  const call = callSnap.data()

  if (!call?.offer) {
    throw new Error('This call is no longer available.')
  }

  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: !call?.audioOnly,
  })

  const { peerConnection, remoteStream, addRemoteCandidate, flushRemoteCandidates } = createPeerSession(localStream)
  peerConnection.onconnectionstatechange = () => {
    onCallStatus?.(peerConnection.connectionState)
  }

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      addDoc(answerCandidates, event.candidate.toJSON()).catch(onCallError)
    }
  }

  await peerConnection.setRemoteDescription(new RTCSessionDescription(call.offer))
  await flushRemoteCandidates()

  const answer = await peerConnection.createAnswer()
  await peerConnection.setLocalDescription(answer)

  await updateDoc(callRef, {
    answer: { type: answer.type, sdp: answer.sdp },
    status: 'active',
    updatedAt: serverTimestamp(),
  })

  const unsubscribeCall = onSnapshot(
    callRef,
    (snapshot) => {
      const data = snapshot.data()
      if (data?.status) onCallStatus?.(data.status)
    },
    onCallError,
  )

  const unsubscribeCandidates = onSnapshot(
    offerCandidates,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          addRemoteCandidate(change.doc.data()).catch(onCallError)
        }
      })
    },
    onCallError,
  )

  return {
    audioOnly: Boolean(call.audioOnly),
    peerConnection,
    localStream,
    remoteStream,
    cleanup: () => [unsubscribeCall, unsubscribeCandidates].forEach((fn) => fn()),
  }
}

export function listenIncomingCalls(uid, chatId, callback, onError) {
  const callsQuery = query(
    collection(db, 'calls'),
    where('receiverId', '==', uid),
    where('chatId', '==', chatId),
    where('status', '==', 'ringing'),
  )

  return onSnapshot(
    callsQuery,
    (snapshot) => {
      const calls = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))

      callback(calls[0] || null)
    },
    onError,
  )
}

export function endCall(callId) {
  return updateDoc(doc(db, 'calls', callId), {
    status: 'ended',
    updatedAt: serverTimestamp(),
  })
}
