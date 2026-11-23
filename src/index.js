import './styles.css'
import './landing.css'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { auth, googleProvider, isFirebaseConfigured } from './firebaseConfig.js'
import { isAdminUser } from './adminAccess.js'

const loginButton = document.querySelector('[data-google-login]')
const logoutButton = document.querySelector('[data-logout]')
const authCard = document.querySelector('[data-auth-card]')
const authStatus = document.querySelector('[data-auth-status]')
const userSession = document.querySelector('[data-user-session]')
const userPhoto = document.querySelector('[data-user-photo]')
const userName = document.querySelector('[data-user-name]')
const userEmail = document.querySelector('[data-user-email]')
const entryActions = document.querySelector('[data-entry-actions]')
const teacherMonitorLink = document.querySelector('[data-teacher-monitor]')

const giftHint = document.querySelector('.gift-click-hint')
const giftFrame = document.querySelector('.spline-scene iframe')

if (giftHint && giftFrame) {
  function dismissGiftHint() {
    giftHint.hidden = true
    window.removeEventListener('blur', handleGiftFrameBlur)
    giftFrame.removeEventListener('focus', dismissGiftHint)
  }

  function handleGiftFrameBlur() {
    // Cross-origin iframe clicks do not bubble to this document. Check where
    // focus moved after the browser finishes transferring it into the scene.
    window.setTimeout(() => {
      if (document.activeElement === giftFrame) dismissGiftHint()
    }, 0)
  }

  giftHint.querySelector('button').addEventListener('click', dismissGiftHint, { once: true })
  giftFrame.addEventListener('focus', dismissGiftHint)
  window.addEventListener('blur', handleGiftFrameBlur)
}

function setSignedOutView() {
  authCard.hidden = false
  userSession.hidden = true
  entryActions.hidden = true
  teacherMonitorLink.hidden = true
  loginButton.disabled = false
  authStatus.className = 'auth-status'
  authStatus.textContent = '로그인하면 활동 선택 버튼이 나타나요.'
}

function setSignedInView(user) {
  const displayName = user.displayName || '마음한칸 사용자'

  authCard.hidden = true
  userSession.hidden = false
  entryActions.hidden = false
  teacherMonitorLink.hidden = !isAdminUser(user)
  userName.textContent = `${displayName}님, 반가워요!`
  userEmail.textContent = user.email || ''

  if (user.photoURL) {
    userPhoto.src = user.photoURL
    userPhoto.alt = `${displayName} 프로필 사진`
    userPhoto.hidden = false
  } else {
    userPhoto.removeAttribute('src')
    userPhoto.alt = ''
    userPhoto.hidden = true
  }
}

function getAuthErrorMessage(error) {
  const messages = {
    'auth/popup-closed-by-user': '로그인 창이 닫혔어요. 준비되면 다시 시도해 주세요.',
    'auth/popup-blocked': '브라우저가 로그인 창을 차단했어요. 팝업을 허용한 뒤 다시 시도해 주세요.',
    'auth/cancelled-popup-request': '이미 로그인 창이 열려 있어요.',
    'auth/unauthorized-domain': '현재 주소가 Firebase 승인 도메인에 등록되어 있지 않아요.',
    'auth/operation-not-allowed': 'Firebase 콘솔에서 Google 로그인 제공업체를 활성화해 주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인한 뒤 다시 시도해 주세요.',
  }

  return messages[error?.code] || '로그인하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
}

if (!isFirebaseConfigured || !auth) {
  loginButton.disabled = true
  authStatus.classList.add('is-error')
  authStatus.textContent = '.env.local에 Firebase 환경 변수 값을 입력한 뒤 개발 서버를 다시 시작해 주세요.'
} else {
  onAuthStateChanged(auth, (user) => {
    if (user) setSignedInView(user)
    else setSignedOutView()
  })

  loginButton.addEventListener('click', async () => {
    loginButton.disabled = true
    authStatus.className = 'auth-status'
    authStatus.textContent = 'Google 로그인 창을 열고 있어요...'

    try {
      await signInWithPopup(auth, googleProvider)
    } catch (error) {
      authStatus.classList.add('is-error')
      authStatus.textContent = getAuthErrorMessage(error)
      loginButton.disabled = false
    }
  })

  logoutButton.addEventListener('click', async () => {
    logoutButton.disabled = true

    try {
      await signOut(auth)
    } catch {
      window.alert('로그아웃하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      logoutButton.disabled = false
    }
  })
}
