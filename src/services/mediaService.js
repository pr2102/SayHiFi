import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { getDownloadURL, ref, uploadString } from 'firebase/storage'
import { storage } from '../lib/firebase'

function dataUrlFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

async function uploadDataUrl(uid, folder, extension, dataUrl) {
  const path = `${folder}/${uid}/${crypto.randomUUID()}.${extension}`
  const fileRef = ref(storage, path)
  await uploadString(fileRef, dataUrl, 'data_url')
  return getDownloadURL(fileRef)
}

export async function pickImageAndUpload(uid) {
  const photo = await Camera.getPhoto({
    quality: 82,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Prompt,
  })

  return uploadDataUrl(uid, 'chat-images', photo.format || 'jpg', photo.dataUrl)
}

export async function uploadVoiceNote(uid, blob) {
  const dataUrl = await dataUrlFromBlob(blob)
  const base64 = dataUrl.split(',')[1]
  const fileName = `voice-${Date.now()}.webm`

  await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
  }).catch(() => {
    // Browser mode may not support the same native cache write behavior.
  })

  return uploadDataUrl(uid, 'voice-notes', 'webm', dataUrl)
}
