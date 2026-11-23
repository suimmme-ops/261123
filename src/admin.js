import './styles.css'
import './admin.css'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from './firebaseConfig.js'
import { isAdminUser } from './adminAccess.js'
import { availableDates, dateLabel, durationLabel, filterRecords } from './adminRecords.js'

const $ = (selector) => document.querySelector(selector)
const page = $('[data-admin-page]')
const datesElement = $('[data-date-options]')
const listElement = $('[data-record-list]')
const status = $('[data-monitor-status]')
const detail = $('[data-detail]')
const empty = $('[data-detail-empty]')
const dialog = $('[data-delete-dialog]')
const image = $('[data-drawing-image]')
const imageStatus = $('[data-image-status]')
const imageLink = $('[data-image-link]')
let records = []
let selectedDates = new Set()
let activeId = null
let pendingDelete = null
let deleting = false
let initialized = false
let unsubscribe
let dataService
let imageRequest = 0
let sessionVersion = 0

function setStatus(message, error = false) {
  status.textContent = message
  status.classList.toggle('is-error', error)
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function renderDates() {
  datesElement.replaceChildren()
  for (const [key, count] of availableDates(records)) {
    const label = element('label', 'date-option')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = selectedDates.has(key)
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedDates.add(key)
      else selectedDates.delete(key)
      renderList()
    })
    label.append(checkbox, element('span', '', dateLabel(key)), element('small', '', String(count)))
    datesElement.append(label)
  }
  if (!records.length) datesElement.append(element('p', 'sidebar-empty', '아직 제출된 기록이 없어요.'))
}

function renderList() {
  const visible = filterRecords(records, selectedDates, $('[data-search]').value)
  $('[data-record-count]').textContent = String(visible.length)
  if (!visible.some(({ id }) => id === activeId)) activeId = visible[0]?.id || null
  listElement.replaceChildren()

  visible.forEach((record) => {
    const row = element('div', 'record-row')
    const button = element('button', `record-select${record.id === activeId ? ' is-active' : ''}`)
    button.type = 'button'
    button.setAttribute('aria-pressed', String(record.id === activeId))
    const label = `${record.studentName} (${dateLabel(record.dateKey)}, ${record.timeLabel})`
    button.setAttribute('aria-label', label)
    button.append(element('strong', '', record.studentName), element('span', '', `(${dateLabel(record.dateKey)}, ${record.timeLabel})`))
    button.addEventListener('click', () => { activeId = record.id; renderList() })
    const remove = element('button', 'record-remove', '삭제')
    remove.type = 'button'
    remove.setAttribute('aria-label', `${label} 삭제`)
    remove.disabled = deleting
    remove.addEventListener('click', () => openDelete(record))
    row.append(button, remove)
    listElement.append(row)
  })

  if (!visible.length) {
    const message = !records.length ? '아직 제출된 기록이 없어요.' : !selectedDates.size ? '날짜를 선택해 주세요.' : '조건에 맞는 학생 기록이 없어요.'
    listElement.append(element('p', 'sidebar-empty', message))
  }
  renderDetail(records.find(({ id }) => id === activeId))
}

function renderDetail(record) {
  const request = ++imageRequest
  image.hidden = true
  image.removeAttribute('src')
  imageLink.hidden = true
  imageLink.removeAttribute('href')
  detail.hidden = !record
  empty.hidden = Boolean(record)
  if (!record) return

  $('[data-detail-name]').textContent = record.studentName
  $('[data-detail-email]').textContent = record.studentEmail
  $('[data-detail-date]').textContent = `${dateLabel(record.dateKey)} · ${record.timeLabel} 제출 (한국 시간)`
  $('[data-chat-duration]').textContent = durationLabel(record.chatDurationMs, record.chatDurationSeconds)
  $('[data-drawing-duration]').textContent = durationLabel(record.drawingDurationMs, record.drawingDurationSeconds)
  $('[data-turns]').textContent = `${record.conversation.filter(({ role }) => role === 'user').length}회`
  $('[data-delete-selected]').disabled = deleting
  const conversation = $('[data-conversation]')
  conversation.replaceChildren()
  record.conversation.forEach((message) => {
    if (typeof message?.content !== 'string') return
    const isStudent = message.role === 'user'
    const article = element('article', `monitor-message ${isStudent ? 'from-student' : 'from-bot'}`)
    article.append(element('span', '', isStudent ? record.studentName : '마음 친구'), element('p', '', message.content))
    conversation.append(article)
  })
  if (!conversation.childElementCount) conversation.append(element('p', 'detail-empty-text', '저장된 대화가 없습니다.'))
  conversation.scrollTop = 0
  imageStatus.hidden = false
  imageStatus.textContent = record.drawingStoragePath ? '그림을 불러오고 있어요.' : '저장된 그림이 없습니다.'
  if (!record.drawingStoragePath) return
  dataService.loadDrawingUrl(record).then((url) => {
    if (request !== imageRequest) return
    image.onload = () => {
      if (request !== imageRequest) return
      imageStatus.hidden = true
      image.hidden = false
      imageLink.href = url
      imageLink.hidden = false
    }
    image.onerror = () => {
      if (request === imageRequest) imageStatus.textContent = '그림을 표시하지 못했어요. 기록을 다시 선택해 주세요.'
    }
    image.alt = `${record.studentName} 학생의 ${dateLabel(record.dateKey)} 마음 그림`
    image.src = url
  }).catch((error) => {
    if (request === imageRequest) imageStatus.textContent = dataService.monitorError(error)
  })
}

function openDelete(record) {
  if (deleting) return
  pendingDelete = record
  $('[data-delete-description]').textContent = `${record.studentName} (${dateLabel(record.dateKey)}, ${record.timeLabel})`
  dialog.showModal()
}

async function startWatching() {
  unsubscribe?.()
  const version = ++sessionVersion
  setStatus('기록을 불러오고 있어요.')
  try {
    dataService = await import('./adminData.js')
    if (version !== sessionVersion || !isAdminUser(auth?.currentUser)) return
    unsubscribe = dataService.watchReflections((items) => {
      records = items
      const dates = availableDates(records)
      if (!initialized) {
        selectedDates = new Set(dates.length ? [dates[0][0]] : [])
        initialized = dates.length > 0
      } else {
        selectedDates = new Set([...selectedDates].filter((key) => dates.some(([date]) => date === key)))
      }
      renderDates()
      renderList()
      setStatus(`전체 ${records.length}개의 기록 · 새 제출은 자동으로 반영됩니다.`)
    }, (error) => {
      records = []
      renderDates()
      renderList()
      setStatus(dataService.monitorError(error), true)
    })
  } catch (error) {
    setStatus(dataService?.monitorError(error) || '조회 기능을 불러오지 못했습니다. 새로고침해 주세요.', true)
  }
}

$('[data-all-dates]').addEventListener('click', () => { selectedDates = new Set(availableDates(records).map(([key]) => key)); renderDates(); renderList() })
$('[data-clear-dates]').addEventListener('click', () => { selectedDates.clear(); renderDates(); renderList() })
$('[data-search]').addEventListener('input', renderList)
$('[data-refresh]').addEventListener('click', startWatching)
$('[data-delete-selected]').addEventListener('click', () => {
  const record = records.find(({ id }) => id === activeId)
  if (record) openDelete(record)
})
dialog.addEventListener('cancel', (event) => { if (deleting) event.preventDefault() })
dialog.addEventListener('close', () => { if (!deleting) pendingDelete = null })
$('[data-delete-confirm]').addEventListener('click', async () => {
  if (!pendingDelete || deleting) return
  deleting = true
  const record = pendingDelete
  const confirm = $('[data-delete-confirm]')
  confirm.disabled = true
  $('[data-delete-cancel]').disabled = true
  confirm.textContent = '삭제 중…'
  try {
    await dataService.deleteReflection(record)
    records = records.filter(({ id }) => id !== record.id)
    renderDates()
    renderList()
    setStatus(`${record.studentName} 학생의 기록과 그림을 삭제했습니다.`)
  } catch (error) {
    setStatus(dataService.monitorError(error), true)
  } finally {
    deleting = false
    confirm.disabled = false
    $('[data-delete-cancel]').disabled = false
    confirm.textContent = '기록 삭제'
    dialog.close()
    pendingDelete = null
    renderList()
  }
})

if (!auth) window.location.replace('/')
else onAuthStateChanged(auth, (user) => {
  page.hidden = true
  unsubscribe?.()
  sessionVersion += 1
  if (!isAdminUser(user)) {
    records = []
    imageRequest += 1
    window.location.replace('/')
    return
  }
  $('[data-account-name]').textContent = user.displayName || '선생님'
  $('[data-account-email]').textContent = user.email || ''
  $('[data-account-initial]').textContent = (user.displayName || '교').slice(0, 1)
  page.hidden = false
  startWatching()
})
window.addEventListener('pagehide', () => { unsubscribe?.(); sessionVersion += 1; imageRequest += 1 })
window.addEventListener('pageshow', (event) => { if (event.persisted && isAdminUser(auth?.currentUser)) startWatching() })
