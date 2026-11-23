import { collection, doc, getFirestore, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore'
import { deleteObject, getStorage, ref, uploadBytes } from 'firebase/storage'
import { firebaseApp } from './firebaseConfig.js'

const COLLECTION_NAME = 'studentReflections'
const STORAGE_FOLDER = 'student-drawings'
const db = firebaseApp ? getFirestore(firebaseApp) : null
const storage = firebaseApp ? getStorage(firebaseApp) : null

export async function submitStudentReflection({ user, conversation, chatTiming, drawingTiming, imageBlob }) {
  if (!db || !storage) throw new Error('Firebase 데이터베이스 또는 Storage가 연결되지 않았습니다.')
  if (!user) throw new Error('로그인 정보가 만료되었습니다. 다시 로그인해 주세요.')
  if (!imageBlob || imageBlob.type !== 'image/png') throw new Error('PNG 그림 데이터를 만들지 못했습니다.')
  if (!chatTiming.startedAtMs || !chatTiming.endedAtMs) throw new Error('대화 시간 기록이 완성되지 않았습니다.')
  if (!drawingTiming.startedAtMs || !drawingTiming.endedAtMs) throw new Error('그림 시간 기록이 완성되지 않았습니다.')

  const reflectionRef = doc(collection(db, COLLECTION_NAME))
  const storagePath = `${STORAGE_FOLDER}/${user.uid}/${reflectionRef.id}.png`
  const imageRef = ref(storage, storagePath)
  let imageUploaded = false

  try {
    await uploadBytes(imageRef, imageBlob, {
      contentType: 'image/png',
      customMetadata: {
        ownerUid: user.uid,
        reflectionId: reflectionRef.id,
      },
    })
    imageUploaded = true

    const chatDurationMs = Math.max(0, chatTiming.endedAtMs - chatTiming.startedAtMs)
    const drawingDurationMs = Math.max(0, drawingTiming.endedAtMs - drawingTiming.startedAtMs)

    await setDoc(reflectionRef, {
      studentUid: user.uid,
      studentName: user.displayName || '',
      studentEmail: user.email || '',
      conversation: conversation.map(({ role, content }) => ({ role, content })),
      userTurnCount: conversation.filter(({ role }) => role === 'user').length,
      chatStartedAt: Timestamp.fromMillis(chatTiming.startedAtMs),
      chatEndedAt: Timestamp.fromMillis(chatTiming.endedAtMs),
      chatDurationMs,
      chatDurationSeconds: Math.round(chatDurationMs / 1000),
      drawingStartedAt: Timestamp.fromMillis(drawingTiming.startedAtMs),
      drawingSubmittedAt: Timestamp.fromMillis(drawingTiming.endedAtMs),
      drawingDurationMs,
      drawingDurationSeconds: Math.round(drawingDurationMs / 1000),
      drawingStoragePath: storagePath,
      drawingContentType: 'image/png',
      createdAt: serverTimestamp(),
    })

    return { id: reflectionRef.id, storagePath }
  } catch (error) {
    if (imageUploaded) {
      try {
        await deleteObject(imageRef)
      } catch {
        // The original submission error is more useful to the user than cleanup failure details.
      }
    }
    throw error
  }
}

export function getSubmissionErrorMessage(error) {
  if (error?.code === 'storage/unauthorized' || error?.code === 'permission-denied') {
    return '저장 권한이 없습니다. Firestore와 Storage 보안 규칙을 확인해 주세요.'
  }
  if (error?.code === 'storage/quota-exceeded' || error?.code === 'resource-exhausted') {
    return 'Firebase 저장 용량 또는 사용량 한도에 도달했습니다.'
  }
  if (error?.code === 'storage/retry-limit-exceeded' || error?.code === 'unavailable') {
    return '네트워크 연결이 불안정해 제출하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
  }
  return error?.message || '제출 중 문제가 발생했어요. 잠시 뒤 다시 시도해 주세요.'
}
