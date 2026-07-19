// Voice Coach — ใช้ Web Speech API ของเบราว์เซอร์ ไม่ต้องเรียก API ภายนอก
export function speak(text: string) {
  if (typeof window === 'undefined') return
  const synth = window.speechSynthesis
  if (!synth) return
  try {
    const utter = new SpeechSynthesisUtterance(text)
    utter.rate = 1.05
    utter.volume = 1
    synth.speak(utter)
  } catch {
    // เบราว์เซอร์ไม่รองรับ — ปล่อยผ่านเงียบๆ
  }
}
