// เสียง beep ที่ generate เอง ไม่ต้องพึ่งไฟล์เสียงภายนอก
let sharedCtx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!sharedCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      sharedCtx = new Ctor()
    }
    if (sharedCtx.state === 'suspended') {
      sharedCtx.resume().catch(() => {})
    }
    return sharedCtx
  } catch {
    return null
  }
}

export function beep(freq = 880, durationMs = 150, type: OscillatorType = 'sine', volume = 0.2) {
  const ctx = getCtx()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(ctx.destination)
    const now = ctx.currentTime
    gain.gain.setValueAtTime(volume, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000)
    osc.start(now)
    osc.stop(now + durationMs / 1000)
  } catch {
    // เงียบไว้ก่อนถ้าเบราว์เซอร์ไม่รองรับ
  }
}

export function beepGo() {
  beep(660, 120, 'sine')
}

export function beepRest() {
  beep(392, 180, 'sine')
}

export function beepTick() {
  beep(880, 60, 'square', 0.12)
}

export function beepFinish() {
  beep(523, 140, 'sine')
  setTimeout(() => beep(659, 140, 'sine'), 150)
  setTimeout(() => beep(784, 220, 'sine'), 300)
}
