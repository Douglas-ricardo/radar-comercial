'use client'

/** Barra fina de progresso de leitura no topo. Herda --signal da landing. */
import { useEffect, useState } from 'react'

export function ScrollProgress() {
  const [p, setP] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement
      const max = h.scrollHeight - h.clientHeight
      setP(max > 0 ? (h.scrollTop / max) * 100 : 0)
    }
    onScroll()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    return () => {
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
    }
  }, [])
  return (
    <div className="fixed inset-x-0 top-0 z-[60] h-0.5">
      <div
        className="h-full bg-[var(--primary)]"
        style={{ width: `${p}%` }}
      />
    </div>
  )
}
