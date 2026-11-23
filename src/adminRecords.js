const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
})
const timeFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function timestampMillis(value) {
  if (value == null) return null
  const millis = typeof value.toMillis === 'function' ? value.toMillis()
    : value instanceof Date ? value.getTime()
      : typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(millis) ? millis : null
}

export function normalizeRecord(id, data) {
  const millis = timestampMillis(data.createdAt) ?? timestampMillis(data.drawingSubmittedAt) ?? timestampMillis(data.chatStartedAt)
  let dateKey = 'undated'
  if (millis !== null) {
    const parts = Object.fromEntries(dateFormatter.formatToParts(millis).map(({ type, value }) => [type, value]))
    dateKey = `${parts.year}-${parts.month}-${parts.day}`
  }
  return {
    ...data, id, millis, dateKey,
    studentName: typeof data.studentName === 'string' && data.studentName.trim() ? data.studentName : '이름 없는 학생',
    studentEmail: typeof data.studentEmail === 'string' ? data.studentEmail : '',
    conversation: Array.isArray(data.conversation) ? data.conversation : [],
    timeLabel: millis === null ? '시간 미상' : timeFormatter.format(millis),
  }
}

export function dateLabel(key) {
  return key === 'undated' ? '날짜 미상' : key.replaceAll('-', '.')
}

export function availableDates(records) {
  const counts = new Map()
  records.forEach(({ dateKey }) => counts.set(dateKey, (counts.get(dateKey) || 0) + 1))
  return [...counts].sort(([a], [b]) => a === b ? 0 : a === 'undated' ? 1 : b === 'undated' ? -1 : b.localeCompare(a))
}

export function filterRecords(records, selectedDates, search = '') {
  const term = search.trim().toLocaleLowerCase()
  return records.filter((record) => selectedDates.has(record.dateKey)
    && `${record.studentName} ${record.studentEmail}`.toLocaleLowerCase().includes(term))
    .sort((a, b) => (b.millis ?? -Infinity) - (a.millis ?? -Infinity) || a.id.localeCompare(b.id))
}

export function durationLabel(ms, seconds) {
  const value = Number.isFinite(ms) ? ms / 1000 : seconds
  if (!Number.isFinite(value) || value < 0) return '—'
  const total = Math.round(value)
  return total >= 60 ? `${Math.floor(total / 60)}분 ${total % 60}초` : `${total}초`
}
