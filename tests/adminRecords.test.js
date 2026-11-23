import test from 'node:test'
import assert from 'node:assert/strict'
import { availableDates, dateLabel, durationLabel, filterRecords, normalizeRecord } from '../src/adminRecords.js'

test('Korea date grouping crosses midnight independently of the host time zone', () => {
  const before = normalizeRecord('before', { createdAt: new Date('2026-11-22T14:59:00Z') })
  const after = normalizeRecord('after', { createdAt: { toMillis: () => Date.parse('2026-11-22T15:01:00Z') } })
  assert.equal(before.dateKey, '2026-11-22')
  assert.equal(after.dateKey, '2026-11-23')
  assert.equal(after.timeLabel, '00:01')
})
test('legacy or incomplete records use submission time and then the undated group', () => {
  const pending = normalizeRecord('pending', { createdAt: null, drawingSubmittedAt: new Date('2026-11-23T00:00:00Z') })
  assert.equal(pending.dateKey, '2026-11-23')
  const missing = normalizeRecord('missing', { conversation: null })
  assert.equal(missing.dateKey, 'undated')
  assert.deepEqual(missing.conversation, [])
  assert.equal(dateLabel(missing.dateKey), '날짜 미상')
})
const records = [
  normalizeRecord('a', { studentName: '가영', studentEmail: 'a@school.kr', createdAt: new Date('2026-11-22T01:00:00Z') }),
  normalizeRecord('b', { studentName: '나영', studentEmail: 'b@school.kr', createdAt: new Date('2026-11-23T01:00:00Z') }),
  normalizeRecord('c', { studentName: '가영', studentEmail: 'a@school.kr', createdAt: new Date('2026-11-23T02:00:00Z') }),
]
test('date checkboxes have newest-first counts and retain distinct records for one student', () => {
  assert.deepEqual(availableDates(records), [['2026-11-23', 2], ['2026-11-22', 1]])
  assert.deepEqual(filterRecords(records, new Set(['2026-11-23', '2026-11-22']), '가영').map(({ id }) => id), ['c', 'a'])
})
test('no selected date means no visible records, and email search is case insensitive', () => {
  assert.equal(filterRecords(records, new Set()).length, 0)
  assert.deepEqual(filterRecords(records, new Set(['2026-11-23']), 'B@SCHOOL.KR').map(({ id }) => id), ['b'])
})
test('time durations support milliseconds, older second fields and missing values', () => {
  assert.equal(durationLabel(125000), '2분 5초')
  assert.equal(durationLabel(undefined, 59), '59초')
  assert.equal(durationLabel(0), '0초')
  assert.equal(durationLabel(undefined), '—')
})
