import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { waitForSubmissionStage } from '../src/submissionWait.js'

const source = (await readFile(new URL('../src/firebaseSubmission.js', import.meta.url), 'utf8'))
  .replace(/^import .*$/gm, '')
  .replaceAll('45000', '30').replaceAll('30000', '10').replaceAll('8000', '10')
let fixtureId = 0
async function fixture(mode) {
  const code = `
    import { waitForSubmissionStage } from '${new URL('../src/submissionWait.js', import.meta.url).href}';
    const mode = ${JSON.stringify(mode)};
    const fixtureId = ${++fixtureId};
    const calls = [];
    const firebaseApp = {};
    const getFirestore = () => ({});
    const getStorage = () => ({});
    const collection = () => 'studentReflections';
    const doc = () => { calls.push('doc'); return { id: 'same-document' }; };
    const ref = (_, path) => ({ path });
    const Timestamp = { fromMillis: (n) => n };
    const serverTimestamp = () => 'server-time';
    let resolveWrite;
    const setDoc = () => {
      calls.push('write');
      if (mode === 'pending') return new Promise((resolve) => { resolveWrite = resolve });
      if (mode === 'denied' || mode === 'cleanup-pending') return Promise.reject(Object.assign(new Error('Denied'), { code: 'permission-denied' }));
      return Promise.resolve();
    };
    const deleteObject = () => {
      calls.push('cleanup');
      return mode === 'cleanup-pending' ? new Promise(() => {}) : Promise.resolve();
    };
    const uploadBytesResumable = () => {
      calls.push('upload');
      let rejectUpload;
      return {
        on: (_, progress, reject, resolve) => {
          rejectUpload = reject;
          progress({bytesTransferred: 5, totalBytes: 10});
          if (mode !== 'upload-pending') queueMicrotask(resolve);
        },
        cancel: () => { calls.push('cancel'); rejectUpload(Object.assign(new Error('Canceled'), {code: 'storage/canceled'})); },
      };
    };
    export { calls };
    export function finishWrite() { resolveWrite(); }
    ${source}
  `
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}
const input = () => ({
  user: { uid: 'student', displayName: '학생', email: 'student@example.com' },
  conversation: [{ role: 'user', content: '오늘의 이야기' }],
  chatTiming: { startedAtMs: 1000, endedAtMs: 2000 },
  drawingTiming: { startedAtMs: 2001, endedAtMs: 4000 },
  imageBlob: new Blob(['png'], { type: 'image/png' }),
})

test('success reports upload progress and only completes after document acknowledgement', async () => {
  const module = await fixture('success')
  const progress = []
  const result = await module.submitStudentReflection({ ...input(), onProgress: (value) => progress.push(value) })
  assert.equal(result.id, 'same-document')
  assert.deepEqual(module.calls, ['doc', 'upload', 'write'])
  assert.ok(progress.some((value) => value.includes('50%')))
})
test('pending document timeout preserves PNG; retry waits on the same write and ID', async () => {
  const module = await fixture('pending')
  await assert.rejects(module.submitStudentReflection(input()), (error) => error.preserveSubmission === true)
  assert.ok(!module.calls.includes('cleanup'))
  module.finishWrite()
  await module.submitStudentReflection(input())
  assert.deepEqual(module.calls, ['doc', 'upload', 'write'])
})
test('upload timeout cancels the task and does not create a Firestore document', async () => {
  const module = await fixture('upload-pending')
  await assert.rejects(module.submitStudentReflection(input()), { code: 'submission/timeout' })
  assert.ok(module.calls.includes('cancel'))
  assert.ok(!module.calls.includes('write'))
})
test('permission denial cleans the uploaded file and reports the original error', async () => {
  const module = await fixture('denied')
  await assert.rejects(module.submitStudentReflection(input()), { code: 'permission-denied' })
  assert.equal(module.calls.at(-1), 'cleanup')
})
test('cleanup cannot block the original error indefinitely', async () => {
  const module = await fixture('cleanup-pending')
  await assert.rejects(module.submitStudentReflection(input()), (error) => error.code === 'permission-denied' && error.cleanupIncomplete)
})
test('oversize PNG is rejected before starting any Firebase operation', async () => {
  const module = await fixture('size')
  await assert.rejects(module.submitStudentReflection({ ...input(), imageBlob: {type: 'image/png', size: 10 * 1024 * 1024 + 1} }), /10MB/)
  assert.deepEqual(module.calls, [])
})
test('stage timeout never reports a late successful write as canceled', async () => {
  let acknowledge
  const write = new Promise((resolve) => { acknowledge = resolve })
  await assert.rejects(waitForSubmissionStage(write, '저장', 5), { code: 'submission/timeout' })
  acknowledge('saved')
  assert.equal(await waitForSubmissionStage(write, '저장', 20), 'saved')
})
