import { collection, doc, getFirestore, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { deleteObject, getStorage, ref, uploadBytesResumable } from 'firebase/storage'
import { firebaseApp } from './firebaseConfig.js'
import { waitForSubmissionStage } from './submissionWait.js'

const COLLECTION_NAME = 'studentReflections'
const STORAGE_FOLDER = 'student-drawings'
const db = firebaseApp ? getFirestore(firebaseApp) : null
const storage = firebaseApp ? getStorage(firebaseApp) : null
if (storage) {
  storage.maxUploadRetryTime = 45000
  storage.maxOperationRetryTime = 10000
}
let submission = null

export async function submitStudentReflection({ user, conversation, chatTiming, drawingTiming, imageBlob, onProgress = () => {} }) {
  if (!db || !storage) throw new Error('Firebase 데이터베이스 또는 Storage가 연결되지 않았습니다.')
  if (!user) throw new Error('로그인 정보가 만료되었습니다. 다시 로그인해 주세요.')
  if (!imageBlob || imageBlob.type !== 'image/png') throw new Error('PNG 그림 데이터를 만들지 못했습니다.')
  if (imageBlob.size > 10 * 1024 * 1024) throw new Error('그림 파일이 10MB를 초과합니다. 그림 크기를 줄인 뒤 다시 제출해 주세요.')
  if (!chatTiming.startedAtMs || !chatTiming.endedAtMs) throw new Error('대화 시간 기록이 완성되지 않았습니다.')
  if (!drawingTiming.startedAtMs || !drawingTiming.endedAtMs) throw new Error('그림 시간 기록이 완성되지 않았습니다.')

  if (submission && submission.uid !== user.uid) throw new Error('제출을 시작한 Google 계정으로 다시 로그인해 주세요.')
  if (!submission) {
    const reflectionRef = doc(collection(db, COLLECTION_NAME))
    const storagePath = `${STORAGE_FOLDER}/${user.uid}/${reflectionRef.id}.png`
    submission = {
      uid: user.uid, reflectionRef, storagePath, imageRef: ref(storage, storagePath),
      imageBlob, conversation, chatTiming, drawingTiming,
      profile: { name: user.displayName || '', email: user.email || '' },
      uploaded: false, uploadPromise: null, writePromise: null,
    }
  }
  const current = submission
  const { reflectionRef, storagePath, imageRef } = current

  try {
    if (!current.uploadPromise) {
      onProgress('그림을 업로드하고 있어요 · 0%')
      current.uploadTask = uploadBytesResumable(imageRef, current.imageBlob, {
        contentType: 'image/png',
        customMetadata: { ownerUid: user.uid, reflectionId: reflectionRef.id },
      })
      current.uploadPromise = new Promise((resolve, reject) => {
        current.uploadTask.on('state_changed', (snapshot) => {
          const percent = Math.round(snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes) * 100)
          onProgress(`그림을 업로드하고 있어요 · ${percent}%`)
        }, reject, () => { current.uploaded = true; resolve() })
      })
    }
    await waitForSubmissionStage(current.uploadPromise, '그림 업로드', 45000, () => current.uploadTask.cancel())

    onProgress('그림 업로드 완료 · 대화 기록을 저장하고 있어요.')
    const chatDurationMs = Math.max(0, current.chatTiming.endedAtMs - current.chatTiming.startedAtMs)
    const drawingDurationMs = Math.max(0, current.drawingTiming.endedAtMs - current.drawingTiming.startedAtMs)

    current.writePromise ??= setDoc(reflectionRef, {
      studentUid: user.uid,
      studentName: current.profile.name,
      studentEmail: current.profile.email,
      conversation: current.conversation.map(({ role, content }) => ({ role, content })),
      userTurnCount: current.conversation.filter(({ role }) => role === 'user').length,
      chatStartedAt: Timestamp.fromMillis(current.chatTiming.startedAtMs),
      chatEndedAt: Timestamp.fromMillis(current.chatTiming.endedAtMs),
      chatDurationMs,
      chatDurationSeconds: Math.round(chatDurationMs / 1000),
      drawingStartedAt: Timestamp.fromMillis(current.drawingTiming.startedAtMs),
      drawingSubmittedAt: Timestamp.fromMillis(current.drawingTiming.endedAtMs),
      drawingDurationMs,
      drawingDurationSeconds: Math.round(drawingDurationMs / 1000),
      drawingStoragePath: storagePath,
      drawingContentType: 'image/png',
      createdAt: serverTimestamp(),
    })
    await waitForSubmissionStage(current.writePromise, '대화 기록 저장', 30000)

    return { id: reflectionRef.id, storagePath }
  } catch (error) {
    if (error.code === 'submission/timeout') throw error
    if (current.uploaded) {
      onProgress('제출 오류를 확인했어요. 업로드된 그림을 정리하고 있어요.')
      try {
        await waitForSubmissionStage(deleteObject(imageRef), '그림 정리', 8000)
        submission = null
      } catch {
        // Keep the original failure visible. Do not wait forever for cleanup.
        error.cleanupIncomplete = true
        submission = null
      }
    } else submission = null
    throw error
  }
}

export function getSubmissionErrorMessage(error) {
  if (error?.code === 'submission/timeout') return error.message
  if (error?.code === 'storage/unauthorized' || error?.code === 'permission-denied') {
    return `저장 권한이 없습니다 (${error.code}). Firebase의 Firestore·Storage 규칙과 Storage의 Firestore 연결 권한을 확인해 주세요.`
  }
  if (error?.code === 'storage/quota-exceeded' || error?.code === 'resource-exhausted') {
    return 'Firebase 저장 용량 또는 사용량 한도에 도달했습니다.'
  }
  if (error?.code === 'storage/retry-limit-exceeded' || error?.code === 'unavailable') {
    return `Firebase 연결이 지연되어 제출하지 못했어요 (${error.code}). 네트워크와 Storage 버킷 설정을 확인해 주세요.`
  }
  if (error?.code === 'storage/bucket-not-found' || error?.code === 'storage/project-not-found') return `Storage 버킷을 찾을 수 없습니다 (${error.code}). Firebase Storage 초기화 및 버킷 이름을 확인해 주세요.`
  if (error?.code === 'storage/canceled') return '그림 업로드를 중단했어요. 연결을 확인한 뒤 다시 제출해 주세요.'
  return error?.message || '제출 중 문제가 발생했어요. 잠시 뒤 다시 시도해 주세요.'
}
