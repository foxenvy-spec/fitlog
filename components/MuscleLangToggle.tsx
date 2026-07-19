'use client'

import type { MuscleLabelLang } from '@/lib/muscle-groups'

export default function MuscleLangToggle({
  lang,
  onChange,
}: {
  lang: MuscleLabelLang
  onChange: (lang: MuscleLabelLang) => void
}) {
  return (
    <div className="shrink-0 inline-flex rounded-full border border-line bg-surface2 p-0.5 text-[10px] tracked uppercase">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange('th')}
        aria-pressed={lang === 'th'}
        className={`px-2.5 py-1 rounded-full transition ${lang === 'th' ? 'bg-steel text-bg' : 'text-muted'}`}
      >
        ไทย
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onChange('en')}
        aria-pressed={lang === 'en'}
        className={`px-2.5 py-1 rounded-full transition ${lang === 'en' ? 'bg-steel text-bg' : 'text-muted'}`}
      >
        EN
      </button>
    </div>
  )
}
