import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

// Run the real deletion flow with local SDK substitutes; never contact Firebase.
const source = (await readFile(new URL('../src/adminData.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '')
async function service({ storageError = '', documentError = false } = {}) {
  const substitutes = `
    const calls = [];
    const auth = { currentUser: { uid: 'teacher' } };
    const firebaseApp = {};
    const isAdminUser = () => true;
    const getStorage = () => ({});
    const getFirestore = () => ({});
    const ref = (_, path) => path;
    const doc = (_, collection, id) => collection + '/' + id;
    const deleteObject = async (path) => {
      calls.push(['storage', path]);
      if (${JSON.stringify(storageError)}) throw Object.assign(new Error('Storage failure'), { code: ${JSON.stringify(storageError)} });
    };
    const deleteDoc = async (path) => {
      calls.push(['document', path]);
      if (${documentError}) throw new Error('Document failure');
    };
    export { calls };
  `
  return import('data:text/javascript;base64,' + Buffer.from(substitutes + source).toString('base64'))
}
const record = { id: 'record-1', studentUid: 'student-1', drawingStoragePath: 'student-drawings/student-1/record-1.png' }

test('deletion targets exactly the selected PNG and document in sequence', async () => {
  const module = await service()
  await module.deleteReflection(record)
  assert.deepEqual(module.calls, [['storage', record.drawingStoragePath], ['document', 'studentReflections/record-1']])
})
test('missing PNG permits retry of a partially deleted record', async () => {
  const module = await service({ storageError: 'storage/object-not-found' })
  await module.deleteReflection(record)
  assert.equal(module.calls.at(-1)[0], 'document')
})
test('storage permission failure prevents deleting the Firestore document', async () => {
  const module = await service({ storageError: 'storage/unauthorized' })
  await assert.rejects(module.deleteReflection(record))
  assert.equal(module.calls.length, 1)
})
test('document failure after image deletion explains partial success', async () => {
  const module = await service({ documentError: true })
  await assert.rejects(module.deleteReflection(record), /그림은 삭제되었지만/)
})
