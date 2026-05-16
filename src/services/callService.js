import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

const rtcConfig = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
}

function attachStream(peerConnection, localStream, remoteVideoRef) {
  localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream))

  peerConnection.ontrack = (event) => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = event.streams[0]
    }
  }
}

export async function startCall({ callId, chatId, callerId, receiverId, localVideoRef, remoteVideoRef, audioOnly }) {
  const peerConnection = new RTCPeerConnection(rtcConfig)
  const callRef = doc(db, 'calls', callId)
  const offerCandidates = collection(callRef, 'offerCandidates')
  const answerCandidates = collection(callRef, 'answerCandidates')

  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: !audioOnly,
  })

  if (localVideoRef.current) localVideoRef.current.srcObject = localStream
  attachStream(peerConnection, localStream, remoteVideoRef)

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) addDoc(offerCandidates, event.candidate.toJSON())
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

  const unsubscribeCall = onSnapshot(callRef, async (snapshot) => {
    const data = snapshot.data()
    if (data?.answer && !peerConnection.currentRemoteDescription) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer))
    }
  })

  const unsubscribeCandidates = onSnapshot(answerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()))
      }
    })
  })

  return { peerConnection, localStream, cleanup: () => [unsubscribeCall, unsubscribeCandidates].forEach((fn) => fn()) }
}

export async function answerCall({ callId, localVideoRef, remoteVideoRef }) {
  const peerConnection = new RTCPeerConnection(rtcConfig)
  const callRef = doc(db, 'calls', callId)
  const offerCandidates = collection(callRef, 'offerCandidates')
  const answerCandidates = collection(callRef, 'answerCandidates')
  const callSnap = await getDoc(callRef)
  const call = callSnap.data()

  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: !call?.audioOnly,
  })

  if (localVideoRef.current) localVideoRef.current.srcObject = localStream
  attachStream(peerConnection, localStream, remoteVideoRef)

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) addDoc(answerCandidates, event.candidate.toJSON())
  }

  await peerConnection.setRemoteDescription(new RTCSessionDescription(call.offer))

  const answer = await peerConnection.createAnswer()
  await peerConnection.setLocalDescription(answer)

  await updateDoc(callRef, {
    answer: { type: answer.type, sdp: answer.sdp },
    status: 'active',
    updatedAt: serverTimestamp(),
  })

  const unsubscribeCandidates = onSnapshot(offerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        peerConnection.addIceCandidate(new RTCIceCandidate(change.doc.data()))
      }
    })
  })

  return { peerConnection, localStream, cleanup: unsubscribeCandidates }
}

export function listenIncomingCalls(uid, chatId, callback) {
  return onSnapshot(collection(db, 'calls'), (snapshot) => {
    const calls = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((call) => call.receiverId === uid && call.status === 'ringing' && call.chatId === chatId)

    callback(calls[0] || null)
  })
}

export function endCall(callId) {
  return updateDoc(doc(db, 'calls', callId), {
    status: 'ended',
    updatedAt: serverTimestamp(),
  })
}
