import { Camera, CameraResultType, CameraSource, MediaTypeSelection } from '@capacitor/camera'
import { Filesystem } from '@capacitor/filesystem'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { storage } from '../lib/firebase'

function withTimeout(promise, message, timeoutMs = 20000) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

async function uploadBlob(uid, folder, extension, blob) {
  if (!storage) throw new Error('Firebase Storage is not configured.')
  const path = `${folder}/${uid}/${crypto.randomUUID()}.${extension}`
  const fileRef = ref(storage, path)
  await withTimeout(
    uploadBytes(fileRef, blob, { contentType: blob.type || `image/${extension}` }),
    'Firebase Storage upload timed out. Check Storage rules and internet connection.',
  )
  return withTimeout(
    getDownloadURL(fileRef),
    'Could not get the uploaded file URL from Firebase Storage.',
  )
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = dataUrl.split(',')
  const contentType = header.match(/data:(.*);base64/)?.[1] || 'image/jpeg'
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: contentType })
}

function base64ToBlob(base64, contentType) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: contentType })
}

async function blobFromPickedImage(image) {
  if (image.webPath) {
    try {
      const response = await fetch(image.webPath)
      if (response.ok) return response.blob()
    } catch {
      // Android content URLs are not always fetchable from the WebView.
    }
  }

  if (image.uri || image.webPath) {
    try {
      const file = await Filesystem.readFile({ path: image.uri || image.webPath })
      return base64ToBlob(file.data, `image/${image.metadata?.format || 'jpeg'}`)
    } catch {
      // Fall through to the thumbnail/data URL fallback below.
    }
  }

  if (image.thumbnail) {
    return dataUrlToBlob(`data:image/${image.metadata?.format || 'jpeg'};base64,${image.thumbnail}`)
  }

  throw new Error('The selected photo could not be read.')
}

async function pickImageViaDataUrl() {
  const photo = await Camera.getPhoto({
    correctOrientation: true,
    quality: 82,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Photos,
  })

  if (!photo.dataUrl) {
    throw new Error('The selected photo could not be read.')
  }

  return {
    blob: dataUrlToBlob(photo.dataUrl),
    extension: photo.format || 'jpg',
  }
}

export function friendlyMediaError(error) {
  const message = error?.message || ''

  if (/cancel/i.test(message)) {
    return ''
  }

  if (/microphone|audio|mediarecorder|notallowed|notreadable|permission/i.test(message) || error?.name === 'NotAllowedError') {
    return 'Microphone access is blocked. Allow microphone access for SayHiFi in Android app settings, then try again.'
  }

  if (/permission|denied|OS-PLUG-CAMR-0005/i.test(message) || error?.code === 'OS-PLUG-CAMR-0005') {
    return 'Photo access is blocked. Allow photo access for SayHiFi in Android app settings, then try again.'
  }

  if (/storage\/unauthorized/i.test(error?.code || message)) {
    return 'Firebase Storage rules blocked this upload. Allow signed-in users to upload chat media.'
  }

  if (/timed out|uploaded file URL/i.test(message)) {
    return message
  }

  return message || 'Could not attach the photo. Please try again.'
}

export async function pickImageAndUpload(uid) {
  const permissions = await Camera.checkPermissions().catch(() => null)
  if (permissions?.photos !== 'granted' && permissions?.photos !== 'limited') {
    try {
      const nextPermissions = await Camera.requestPermissions({ permissions: ['photos'] })
      if (nextPermissions.photos !== 'granted' && nextPermissions.photos !== 'limited') {
        throw new Error('Photo permission was not granted.')
      }
    } catch (error) {
      if (permissions) throw error
    }
  }

  let pickedImage
  try {
    const { results } = await Camera.chooseFromGallery({
      allowMultipleSelection: false,
      correctOrientation: true,
      includeMetadata: true,
      mediaType: MediaTypeSelection.Photo,
      quality: 82,
      webUseInput: true,
    })
    const image = results?.[0]

    if (!image) {
      throw new Error('No photo was selected.')
    }

    const blob = await blobFromPickedImage(image)
    pickedImage = {
      blob,
      extension: image.metadata?.format || 'jpg',
    }
  } catch (error) {
    if (/cancel/i.test(error?.message || '')) throw error
    pickedImage = await pickImageViaDataUrl()
  }

  return uploadBlob(uid, 'chat-images', pickedImage.extension, pickedImage.blob)
}

export async function uploadVoiceNote(uid, blob) {
  if (!blob?.size) {
    throw new Error('No audio was recorded. Hold record for a moment, then stop and try again.')
  }

  const extension = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
  return uploadBlob(uid, 'voice-notes', extension, blob)
}
