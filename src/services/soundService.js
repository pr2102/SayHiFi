let audioContext

function getAudioContext() {
  audioContext ||= new AudioContext()
  return audioContext
}

function playTone({ frequency, duration, delay = 0, type = 'sine', gain = 0.055 }) {
  const context = getAudioContext()
  const oscillator = context.createOscillator()
  const volume = context.createGain()
  const startAt = context.currentTime + delay
  const endAt = startAt + duration

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startAt)
  volume.gain.setValueAtTime(0.0001, startAt)
  volume.gain.exponentialRampToValueAtTime(gain, startAt + 0.015)
  volume.gain.exponentialRampToValueAtTime(0.0001, endAt)

  oscillator.connect(volume)
  volume.connect(context.destination)
  oscillator.start(startAt)
  oscillator.stop(endAt + 0.02)
}

export async function unlockNotificationAudio() {
  const context = getAudioContext()
  if (context.state === 'suspended') {
    await context.resume()
  }
}

export async function playSendSound() {
  await unlockNotificationAudio()
  playTone({ frequency: 660, duration: 0.07, type: 'triangle' })
  playTone({ frequency: 880, duration: 0.09, delay: 0.065, type: 'triangle', gain: 0.045 })
}

export async function playReceiveSound() {
  await unlockNotificationAudio()
  playTone({ frequency: 520, duration: 0.08, type: 'sine' })
  playTone({ frequency: 390, duration: 0.12, delay: 0.075, type: 'sine', gain: 0.045 })
}
