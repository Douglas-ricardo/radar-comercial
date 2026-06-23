'use client'

/**
 * Fallback de scroll-reveal para navegadores SEM `animation-timeline: view()`
 * (Safari antigo, WebViews Android antigas). Onde há suporte nativo, o CSS
 * cuida de tudo e este componente não faz nada.
 *
 * Degrade-safe: só esconde os elementos (.rdr-js) depois de confirmar que vai
 * revelá-los via IntersectionObserver. Sem JS, tudo fica visível (opacity:1).
 */
import { useEffect } from 'react'

export function ScrollReveal() {
  useEffect(() => {
    const supported =
      typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timeline: view()')
    if (supported) return // CSS nativo já resolve

    // sem IntersectionObserver (WebView muito antiga) → não esconde nada
    if (typeof IntersectionObserver === 'undefined') return
    const root = document.querySelector('.landing-2026')
    if (!root) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    root.classList.add('rdr-js') // ativa o estado inicial escondido só agora
    const els = Array.from(root.querySelectorAll('.rdr-reveal'))
    const reveal = (el: Element) => el.classList.add('is-in')
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            reveal(e.target)
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    )
    els.forEach((el) => io.observe(el))
    // failsafe: se o observer não entregar (IO parcial/quebrado), revela tudo
    // depois de 4s — pior caso é sem animação, nunca conteúdo invisível.
    const failsafe = window.setTimeout(() => els.forEach(reveal), 4000)
    return () => {
      io.disconnect()
      clearTimeout(failsafe)
    }
  }, [])
  return null
}
