import { waitForSubmissionStage } from './submissionWait.js'

const MAX_HISTORY = 20

export function createDrawingBoard({ onSubmit } = {}) {
  const canvas = document.querySelector('[data-drawing-canvas]')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const colorButtons = [...document.querySelectorAll('[data-color]')]
  const lightnessInput = document.querySelector('[data-lightness]')
  const opacityInput = document.querySelector('[data-opacity]')
  const sizeInput = document.querySelector('[data-size]')
  const lightnessOutput = document.querySelector('[data-lightness-output]')
  const opacityOutput = document.querySelector('[data-opacity-output]')
  const sizeOutput = document.querySelector('[data-size-output]')
  const eraserButton = document.querySelector('[data-eraser]')
  const undoButton = document.querySelector('[data-undo]')
  const clearButton = document.querySelector('[data-clear]')
  const submitButton = document.querySelector('[data-submit-drawing]')
  const submitStatus = document.querySelector('[data-submit-status]')

  let selectedColor = colorButtons[0].dataset.color
  let isDrawing = false
  let isEraser = false
  let hasDrawn = false
  let lastPoint = null
  let boardLocked = false
  const history = []

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    const ratio = window.devicePixelRatio || 1
    const previous = document.createElement('canvas')

    if (canvas.width && canvas.height) {
      previous.width = canvas.width
      previous.height = canvas.height
      previous.getContext('2d').drawImage(canvas, 0, 0)
    }

    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)

    if (previous.width && previous.height) {
      context.drawImage(previous, 0, 0, previous.width, previous.height, 0, 0, width, height)
    }
  }

  function saveHistory() {
    history.push(canvas.toDataURL('image/png'))
    if (history.length > MAX_HISTORY) history.shift()
    undoButton.disabled = history.length === 0
  }

  function restoreImage(dataUrl) {
    const image = new Image()
    image.onload = () => {
      const rect = canvas.getBoundingClientRect()
      context.save()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.restore()
      context.drawImage(image, 0, 0, rect.width, rect.height)
    }
    image.src = dataUrl
  }

  function clearCanvas({ remember = true } = {}) {
    if (remember) saveHistory()
    const rect = canvas.getBoundingClientRect()
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, rect.width, rect.height)
    hasDrawn = false
    submitStatus.className = ''
    submitStatus.textContent = '그림은 아직 어디에도 전송되지 않아요.'
  }

  function getPoint(event) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  function hexToHsl(hex) {
    const number = Number.parseInt(hex.slice(1), 16)
    const red = ((number >> 16) & 255) / 255
    const green = ((number >> 8) & 255) / 255
    const blue = (number & 255) / 255
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    let hue = 0
    let saturation = 0
    const lightness = (max + min) / 2

    if (max !== min) {
      const delta = max - min
      saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
      if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0)
      if (max === green) hue = (blue - red) / delta + 2
      if (max === blue) hue = (red - green) / delta + 4
      hue /= 6
    }

    return { hue: Math.round(hue * 360), saturation: Math.round(saturation * 100) }
  }

  function getBrushColor() {
    if (isEraser) return '#ffffff'
    const { hue, saturation } = hexToHsl(selectedColor)
    return `hsl(${hue} ${saturation}% ${lightnessInput.value}%)`
  }

  function startStroke(event) {
    if (boardLocked) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    saveHistory()
    isDrawing = true
    lastPoint = getPoint(event)
    canvas.setPointerCapture(event.pointerId)
  }

  function drawStroke(event) {
    if (!isDrawing || !lastPoint) return
    event.preventDefault()
    const point = getPoint(event)

    context.beginPath()
    context.moveTo(lastPoint.x, lastPoint.y)
    context.lineTo(point.x, point.y)
    context.lineWidth = Number(sizeInput.value)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.globalAlpha = isEraser ? 1 : Number(opacityInput.value) / 100
    context.strokeStyle = getBrushColor()
    context.stroke()
    context.globalAlpha = 1

    lastPoint = point
    hasDrawn = true
  }

  function endStroke(event) {
    if (!isDrawing) return
    isDrawing = false
    lastPoint = null
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }

  function updateRangeOutputs() {
    lightnessOutput.value = `${lightnessInput.value}%`
    opacityOutput.value = `${opacityInput.value}%`
    sizeOutput.value = `${sizeInput.value}px`
  }

  colorButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedColor = button.dataset.color
      isEraser = false
      eraserButton.classList.remove('is-active')
      eraserButton.setAttribute('aria-pressed', 'false')
      colorButtons.forEach((item) => {
        const isSelected = item === button
        item.classList.toggle('is-selected', isSelected)
        item.setAttribute('aria-pressed', String(isSelected))
      })
    })
  })

  ;[lightnessInput, opacityInput, sizeInput].forEach((input) => {
    input.addEventListener('input', updateRangeOutputs)
  })

  eraserButton.addEventListener('click', () => {
    isEraser = !isEraser
    eraserButton.classList.toggle('is-active', isEraser)
    eraserButton.setAttribute('aria-pressed', String(isEraser))
  })

  undoButton.addEventListener('click', () => {
    const previous = history.pop()
    if (!previous) return
    restoreImage(previous)
    undoButton.disabled = history.length === 0
  })

  clearButton.addEventListener('click', () => clearCanvas())

  function lockBoard(locked) {
    boardLocked = locked
    isDrawing = false
    lastPoint = null
    document.querySelectorAll('.drawing-tools button, .drawing-tools input').forEach((control) => {
      control.disabled = locked
    })
    if (!locked) undoButton.disabled = history.length === 0
    canvas.setAttribute('aria-disabled', String(locked))
  }

  submitButton.addEventListener('click', async () => {
    if (!hasDrawn) {
      submitStatus.className = 'is-error'
      submitStatus.textContent = '먼저 오늘의 마음을 그림으로 표현해 주세요.'
      return
    }

    submitButton.disabled = true
    const submittedAtMs = Date.now()
    lockBoard(true)
    submitButton.textContent = '제출하고 있어요...'
    submitStatus.className = ''
    submitStatus.textContent = '그림과 오늘의 대화 기록을 안전하게 저장하고 있어요.'
    let attemptActive = true

    try {
      const blob = await waitForSubmissionStage(new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) resolve(result)
          else reject(new Error('그림 파일을 만들지 못했습니다.'))
        }, 'image/png')
      }), '그림 파일 생성', 10000).catch((error) => {
        error.preserveSubmission = false
        throw error
      })

      if (!onSubmit) throw new Error('제출 기능을 연결하지 못했습니다.')
      const result = await onSubmit({ blob, submittedAtMs, onProgress: (message) => {
        if (attemptActive) submitStatus.textContent = message
      } })
      window.dispatchEvent(new CustomEvent('drawing:submitted', { detail: result }))
      submitStatus.className = 'is-success'
      submitStatus.textContent = '제출이 완료되었어요. 오늘의 마음을 소중히 기록했어요.'
      submitButton.textContent = '제출 완료'
    } catch (error) {
      submitStatus.className = 'is-error'
      submitStatus.textContent = error.message
      lockBoard(Boolean(error.preserveSubmission))
      submitButton.textContent = error.preserveSubmission ? '제출 상태 다시 확인' : '다시 제출하기'
      submitButton.disabled = false
    } finally {
      attemptActive = false
    }
  })

  canvas.addEventListener('pointerdown', startStroke)
  canvas.addEventListener('pointermove', drawStroke)
  canvas.addEventListener('pointerup', endStroke)
  canvas.addEventListener('pointercancel', endStroke)
  new ResizeObserver(resizeCanvas).observe(canvas)

  updateRangeOutputs()
  resizeCanvas()
  undoButton.disabled = true

  return { clear: clearCanvas }
}
