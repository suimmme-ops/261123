// Stop waiting in the UI without pretending that a queued Firestore write was canceled.
export function waitForSubmissionStage(promise, stage, timeoutMs, onTimeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.()
      const error = new Error(`${stage} 응답이 지연되고 있어요. 연결을 확인한 뒤 제출 상태를 다시 확인해 주세요. 새로고침하면 현재 그림을 잃을 수 있어요.`)
      error.code = 'submission/timeout'
      error.preserveSubmission = true
      reject(error)
    }, timeoutMs)
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer))
  })
}
