import './styles.css'
import './student.css'
import { onAuthStateChanged } from 'firebase/auth'
import { createChatbot } from './chatbot.js'
import { createDrawingBoard } from './drawing.js'
import { auth } from './firebaseConfig.js'

const panels = {
  key: document.querySelector('[data-step="key"]'),
  chat: document.querySelector('[data-step="chat"]'),
  draw: document.querySelector('[data-step="draw"]'),
}

const progressItems = [...document.querySelectorAll('[data-progress]')]
const keyForm = document.querySelector('[data-key-form]')
const keyInput = document.querySelector('#api-key')
const keyStatus = document.querySelector('[data-key-status]')
const showKeyCheckbox = document.querySelector('[data-show-key]')
const endChatButton = document.querySelector('[data-end-chat]')
const finalTurns = document.querySelector('[data-final-turns]')
const studentMain = document.querySelector('[data-student-main]')
const studentAccount = document.querySelector('[data-student-account]')
const studentPhoto = document.querySelector('[data-student-photo]')
const studentName = document.querySelector('[data-student-name]')
const studentEmail = document.querySelector('[data-student-email]')

let chatbot
let drawingBoard
let currentUser
let drawingStartedAtMs

function showStep(step) {
  Object.entries(panels).forEach(([name, panel]) => {
    panel.hidden = name !== step
  })

  const stepOrder = ['key', 'chat', 'draw']
  const currentIndex = stepOrder.indexOf(step)

  progressItems.forEach((item) => {
    const itemIndex = stepOrder.indexOf(item.dataset.progress)
    item.classList.toggle('is-current', itemIndex === currentIndex)
    item.classList.toggle('is-complete', itemIndex < currentIndex)
  })

  panels[step]?.querySelector('h1')?.focus({ preventScroll: true })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

showKeyCheckbox.addEventListener('change', () => {
  keyInput.type = showKeyCheckbox.checked ? 'text' : 'password'
})

keyForm.addEventListener('submit', async (event) => {
  event.preventDefault()

  const submitButton = keyForm.querySelector('button[type="submit"]')
  const apiKey = keyInput.value.trim()
  submitButton.disabled = true
  keyInput.disabled = true
  keyStatus.className = 'key-status'
  keyStatus.textContent = 'API 키를 안전하게 확인하고 있어요...'

  try {
    chatbot = createChatbot({ apiKey })
    await chatbot.verifyKey()
    keyStatus.classList.add('is-success')
    keyStatus.textContent = '연결되었어요. 마음 친구를 불러올게요.'
    keyInput.value = ''
    showStep('chat')
    chatbot.start()
  } catch (error) {
    keyStatus.classList.add('is-error')
    keyStatus.textContent = error.message
    chatbot = undefined
    keyInput.disabled = false
    keyInput.focus()
  } finally {
    submitButton.disabled = false
  }
})

endChatButton.addEventListener('click', () => {
  if (!chatbot?.canFinish()) return

  chatbot.finish()
  drawingStartedAtMs = Date.now()
  finalTurns.textContent = String(chatbot.getTurnCount())
  showStep('draw')
  drawingBoard ??= createDrawingBoard({ onSubmit: handleDrawingSubmit })
})

async function handleDrawingSubmit({ blob, submittedAtMs }) {
  const user = auth?.currentUser

  if (!user || user.uid !== currentUser?.uid) {
    throw new Error('로그인 정보가 만료되었습니다. 처음 화면에서 다시 로그인해 주세요.')
  }

  let submissionModule

  try {
    submissionModule = await import('./firebaseSubmission.js')
    return await submissionModule.submitStudentReflection({
      user,
      conversation: chatbot.getConversation(),
      chatTiming: chatbot.getTiming(),
      drawingTiming: {
        startedAtMs: drawingStartedAtMs,
        endedAtMs: submittedAtMs,
      },
      imageBlob: blob,
    })
  } catch (error) {
    const message = submissionModule?.getSubmissionErrorMessage(error) || '제출 모듈을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'
    throw new Error(message)
  }
}

function showAuthenticatedStudent(user) {
  const displayName = user.displayName || '학생'
  currentUser = user
  studentName.textContent = displayName
  studentEmail.textContent = user.email || ''

  if (user.photoURL) {
    studentPhoto.src = user.photoURL
    studentPhoto.alt = `${displayName} 프로필 사진`
    studentPhoto.hidden = false
  } else {
    studentPhoto.removeAttribute('src')
    studentPhoto.alt = ''
    studentPhoto.hidden = true
  }

  studentAccount.hidden = false
  studentMain.hidden = false
}

if (!auth) {
  window.location.replace('/?loginRequired=1')
} else {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace('/?loginRequired=1')
      return
    }

    showAuthenticatedStudent(user)
  })
}
