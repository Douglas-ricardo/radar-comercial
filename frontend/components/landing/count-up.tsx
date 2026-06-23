'use client'

/** Conta de 0 até `to` quando entra na viewport. Respeita reduced-motion. */
import { useEffect, useRef, useState } from 'react'

// formatação pt-BR determinística (sem toLocaleString/ICU) — evita qualquer
// divergência server/cliente e não depende do build do Node.
function formatPtBr(n: number, decimals: number) {
  const fixed = Math.abs(n).toFixed(decimals)
  const [intPart, decPart] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const sign = n < 0 ? '-' : ''
  return decPart ? `${sign}${grouped},${decPart}` : `${sign}${grouped}`
}

export function CountUp({
  to,
  duration = 1500,
  prefix = '',
  suffix = '',
  decimals = 0,
  className = '',
}: {
  to: number
  duration?: number
  prefix?: string
  suffix?: string
  decimals?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [val, setVal] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    started.current = false // re-anima se `to`/`duration` mudarem
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(to)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started.current) return
        started.current = true
        const t0 = performance.now()
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / duration)
          setVal(to * (1 - Math.pow(1 - p, 3)))
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.4 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [to, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatPtBr(val, decimals)}
      {suffix}
    </span>
  )
}
