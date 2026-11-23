import { collection, deleteDoc, doc, getFirestore, onSnapshot } from 'firebase/firestore'
import { deleteObject, getDownloadURL, getStorage, ref } from 'firebase/storage'
import { auth, firebaseApp } from './firebaseConfig.js'
import { isAdminUser } from './adminAccess.js'
import { normalizeRecord } from './adminRecords.js'

function requireAdmin() {
  if (!firebaseApp || !isAdminUser(auth?.currentUser)) throw new Error('관리자 로그인이 필요합니다.')
}

export function watchReflections(onRecords, onError) {
  requireAdmin()
  return onSnapshot(collection(getFirestore(firebaseApp), 'studentReflections'), (snapshot) => {
    if (!isAdminUser(auth?.currentUser)) return
    onRecords(snapshot.docs.map((item) => normalizeRecord(item.id, item.data())))
  }, onError)
}

function drawingReference(record) {
  // Keep all file operations in this application's student drawing folder.
  const expectedPath = `student-drawings/${record.studentUid}/${record.id}.png`
  if (record.drawingStoragePath !== expectedPath || !record.studentUid) {
    throw new Error('그림 저장 경로가 올바르지 않습니다.')
  }
  return ref(getStorage(firebaseApp), expectedPath)
}

export async function loadDrawingUrl(record) {
  requireAdmin()
  return getDownloadURL(drawingReference(record))
}

export async function deleteReflection(record) {
  requireAdmin()
  let imageDeleted = false
  if (record.drawingStoragePath) {
    try {
      await deleteObject(drawingReference(record))
      imageDeleted = true
    } catch (error) {
      // A missing file is expected when retrying a partially completed deletion.
      if (error.code !== 'storage/object-not-found') throw error
    }
  }
  requireAdmin()
  try {
    await deleteDoc(doc(getFirestore(firebaseApp), 'studentReflections', record.id))
  } catch (error) {
    if (imageDeleted) throw new Error('그림은 삭제되었지만 대화 기록 삭제에 실패했습니다. 다시 삭제를 눌러 완료해 주세요.')
    throw error
  }
}

export function monitorError(error) {
  if (['permission-denied', 'storage/unauthorized'].includes(error?.code)) {
    return '조회 또는 삭제 권한이 없습니다. Firebase에서 관리자용 Firestore·Storage 보안 규칙을 확인해 주세요.'
  }
  if (error?.code === 'storage/object-not-found') return '저장된 그림을 찾을 수 없습니다.'
  if (['unavailable', 'storage/retry-limit-exceeded'].includes(error?.code)) return '연결이 불안정합니다. 네트워크를 확인한 후 다시 시도해 주세요.'
  return error?.message || '기록을 불러오지 못했습니다. 새로고침해 주세요.'
}
