import OpenAI from 'openai'

const MODEL = 'gpt-5.4-mini'
const MIN_TURNS = 3
const MAX_TURNS = 7
const INITIAL_MESSAGE = '안녕! 나는 오늘 하루를 함께 돌아볼 마음 친구야. 오늘 학교생활은 전체적으로 어땠어? 가장 먼저 떠오르는 느낌부터 편하게 말해 줘.'

const BASE_INSTRUCTIONS = `
당신은 중고등학생이 오늘 학교생활을 돌아보도록 돕는 따뜻한 대화 친구입니다.
한국어로 짧고 자연스럽게 답하고, 한 번에 질문은 하나만 합니다.
학생의 감정을 판단하거나 진단하지 말고 먼저 공감한 뒤 구체적인 하루 경험을 돌아보는 질문을 합니다.
의료적 조언이나 상담을 대신하지 않습니다. 학생이 자신이나 타인을 해칠 위험을 말하면 즉시 가까운 보호자나 교사 등 믿을 수 있는 어른에게 알리고 긴급 도움을 요청하도록 안내합니다.
이 대화는 3회에서 7회의 학생 답변 안에 마무리될 예정입니다.
`.trim()

export function createChatbot({ apiKey }) {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
  const messageForm = document.querySelector('[data-message-form]')
  const messageInput = messageForm.querySelector('textarea')
  const sendButton = messageForm.querySelector('button[type="submit"]')
  const messagesElement = document.querySelector('[data-messages]')
  const typingIndicator = document.querySelector('[data-typing]')
  const turnCountElement = document.querySelector('[data-turn-count]')
  const turnGuide = document.querySelector('[data-turn-guide]')
  const endChatButton = document.querySelector('[data-end-chat]')

  const conversation = []
  let turnCount = 0
  let isSending = false
  let isFinished = false
  let startedAtMs = null
  let endedAtMs = null

  async function verifyKey() {
    if (!apiKey) throw new Error('API 키를 입력해 주세요.')

    try {
      await client.models.retrieve(MODEL)
    } catch (error) {
      if (error?.status === 401) throw new Error('API 키가 올바르지 않습니다. 다시 확인해 주세요.')
      if (error?.status === 403) throw new Error('이 API 키에는 모델을 사용할 권한이 없습니다.')
      throw new Error('API 키를 확인하지 못했습니다. 네트워크와 API 사용 상태를 확인해 주세요.')
    }
  }

  function addMessage(role, text, { isError = false } = {}) {
    const article = document.createElement('article')
    article.className = `message message-${role}${isError ? ' is-error' : ''}`

    const label = document.createElement('span')
    label.className = 'message-label'
    label.textContent = role === 'assistant' ? '마음 친구' : '나'

    const content = document.createElement('p')
    content.textContent = text

    article.append(label, content)
    messagesElement.append(article)
    messagesElement.scrollTop = messagesElement.scrollHeight
  }

  function updateTurnState() {
    turnCountElement.textContent = String(turnCount)
    const remainingUntilFinish = Math.max(0, MIN_TURNS - turnCount)
    const canEnd = turnCount >= MIN_TURNS

    endChatButton.disabled = !canEnd || isSending

    if (turnCount >= MAX_TURNS) {
      turnGuide.textContent = '7번의 이야기를 모두 나눴어요. 이제 대화를 마치고 그림으로 표현해 보세요.'
      messageInput.disabled = true
      sendButton.disabled = true
      endChatButton.disabled = false
    } else if (canEnd) {
      turnGuide.textContent = '원한다면 조금 더 이야기하거나 지금 대화를 마칠 수 있어요.'
    } else {
      turnGuide.textContent = `${remainingUntilFinish}번 더 이야기하면 대화를 마칠 수 있어요.`
    }
  }

  async function sendMessage(text) {
    if (isSending || isFinished || turnCount >= MAX_TURNS) return

    const cleanText = text.trim()
    if (!cleanText) return

    startedAtMs ??= Date.now()
    isSending = true
    messageInput.disabled = true
    sendButton.disabled = true
    endChatButton.disabled = true
    typingIndicator.hidden = false
    addMessage('user', cleanText)
    conversation.push({ role: 'user', content: cleanText })
    turnCount += 1
    updateTurnState()

    try {
      const response = await client.responses.create({
        model: MODEL,
        instructions: BASE_INSTRUCTIONS,
        input: conversation,
        reasoning: { effort: 'low' },
        max_output_tokens: 280,
        store: false,
      })

      const reply = response.output_text?.trim() || '천천히 생각해도 괜찮아. 오늘 마음에 남은 장면을 하나 떠올려 볼래?'
      conversation.push({ role: 'assistant', content: reply })
      addMessage('assistant', reply)
    } catch (error) {
      conversation.pop()
      turnCount -= 1
      addMessage('assistant', getRequestErrorMessage(error), { isError: true })
    } finally {
      isSending = false
      typingIndicator.hidden = true
      if (turnCount < MAX_TURNS) {
        messageInput.disabled = false
        sendButton.disabled = false
        messageInput.focus()
      }
      updateTurnState()
    }
  }

  function getRequestErrorMessage(error) {
    if (error?.status === 401) return 'API 키 인증이 만료되었어요. 페이지를 새로고침하고 다시 연결해 주세요.'
    if (error?.status === 429) return '요청 한도에 도달했어요. 잠시 뒤 다시 이야기해 주세요.'
    return '답변을 불러오지 못했어요. 인터넷 연결을 확인하고 같은 내용을 다시 보내 주세요.'
  }

  function handleSubmit(event) {
    event.preventDefault()
    const text = messageInput.value
    messageInput.value = ''
    sendMessage(text)
  }

  function handleKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      messageForm.requestSubmit()
    }
  }

  function start() {
    conversation.push({ role: 'assistant', content: INITIAL_MESSAGE })
    addMessage('assistant', INITIAL_MESSAGE)
    messageForm.addEventListener('submit', handleSubmit)
    messageInput.addEventListener('keydown', handleKeydown)
    updateTurnState()
    messageInput.focus()
  }

  function finish() {
    isFinished = true
    endedAtMs = Date.now()
    messageInput.disabled = true
    sendButton.disabled = true
  }

  return {
    verifyKey,
    start,
    finish,
    canFinish: () => turnCount >= MIN_TURNS && !isSending,
    getTurnCount: () => turnCount,
    getConversation: () => conversation.map(({ role, content }) => ({ role, content })),
    getTiming: () => ({ startedAtMs, endedAtMs }),
  }
}
