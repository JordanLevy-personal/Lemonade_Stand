import { useEffect, useRef } from 'react'

const MUSIC_SRC = '/audio/Pixelated_Sunshine.mp3'

export function useBackgroundMusic(): void {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const audio = new Audio(MUSIC_SRC)
    audio.loop = true
    audio.volume = 0.3
    audioRef.current = audio

    const _startPlayback = (): void => {
      if (startedRef.current) return
      startedRef.current = true

      audio.play().catch(() => {
        // Browser blocked playback — will retry on next interaction
        startedRef.current = false
      })
    }

    const interactionEvents = ['click', 'keydown', 'touchstart'] as const
    for (const event of interactionEvents) {
      document.addEventListener(event, _startPlayback, { once: false })
    }

    return () => {
      for (const event of interactionEvents) {
        document.removeEventListener(event, _startPlayback)
      }
      audio.pause()
      audioRef.current = null
    }
  }, [])
}
