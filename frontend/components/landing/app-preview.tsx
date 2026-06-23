import { CountUp } from './count-up'
import { getInitials } from '@/lib/utils'

/**
 * Mock de alta fidelidade do dashboard — peça central do hero.
 * Usa os tokens claros da landing (.landing-2026): índigo/ciano de marca +
 * verde/vermelho só para a semântica financeira (ganho/perda).
 */

const bars = [38, 52, 44, 61, 49, 70, 58, 66, 54, 72, 63, 80]
const rows = [
  { name: 'Padaria do Centro', days: 73, value: 'R$ 12.400', risk: true },
  { name: 'Mercearia União', days: 41, value: 'R$ 7.850', risk: true },
  { name: 'Distribuidora Alfa', days: 28, value: 'R$ 5.200', risk: false },
]

const TONES = {
  primary: { color: 'var(--primary)', width: '64%' },
  gain: { color: 'var(--gain)', width: '82%' },
  loss: { color: 'var(--loss)', width: '38%' },
} as const

export function AppPreview() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--card)] shadow-[0_30px_80px_-40px_rgba(14,18,32,0.45)]">
      {/* chrome do navegador */}
      <div className="flex items-center gap-3 border-b border-[var(--line)] bg-[var(--bg-soft)] px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md bg-[var(--card)] px-3 py-1 text-[11px] text-[var(--muted)] ring-1 ring-[var(--line)]">
          <svg viewBox="0 0 24 24" className="h-3 w-3 fill-none stroke-current stroke-2"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          app.radarcomercial.com.br/dashboard
        </div>
      </div>

      <div className="flex">
        {/* sidebar */}
        <aside className="hidden w-44 shrink-0 border-r border-[var(--line)] p-3 sm:block">
          <div className="flex items-center gap-2 px-2 py-1.5">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-[var(--primary)] text-[10px] font-bold text-white">R</span>
            <span className="text-sm font-semibold text-[var(--ink)]">Radar</span>
          </div>
          <nav className="mt-4 space-y-0.5 text-[13px]">
            {[
              ['Visão geral', true],
              ['Insights', false],
              ['Carteira ativa', false],
              ['Disparo', false],
              ['Equipe', false],
            ].map(([label, active]) => (
              <div
                key={label as string}
                className="rounded-md px-2.5 py-1.5"
                style={
                  active
                    ? { background: 'color-mix(in oklab, var(--primary) 12%, transparent)', color: 'var(--primary)', fontWeight: 600 }
                    : { color: 'var(--muted)' }
                }
              >
                {label as string}
              </div>
            ))}
          </nav>
        </aside>

        {/* main */}
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-[var(--ink)] sm:text-base">Visão geral</h4>
              <p className="text-[11px] text-[var(--muted)]">Últimos 30 dias · atualizado hoje</p>
            </div>
            <span className="rounded-md border border-[var(--line)] px-2.5 py-1 text-[11px] text-[var(--muted)]">1 mês ▾</span>
          </div>

          {/* KPIs */}
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <Kpi label="Receita identificada" prefix="R$ " to={521000} tone="primary" />
            <Kpi label="Clientes em risco" to={47} tone="loss" />
            <Kpi label="Recuperável" prefix="R$ " to={427} suffix="K" tone="gain" />
          </div>

          {/* chart */}
          <div className="mt-3 rounded-xl border border-[var(--line)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-[var(--muted)]">Receita por mês</span>
              <span className="text-[11px] font-semibold text-[var(--gain)]">+18% recuperável</span>
            </div>
            <div className="flex h-20 items-end gap-1.5">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t"
                  style={{ height: `${h}%`, background: i >= 9 ? 'var(--gain)' : 'var(--primary)', opacity: i >= 9 ? 1 : 0.85 }}
                />
              ))}
            </div>
          </div>

          {/* oportunidades */}
          <div className="mt-3 space-y-1.5">
            {rows.map((r) => (
              <div key={r.name} className="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-2 text-[12px]">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--bg-soft)] text-[10px] font-semibold text-[var(--primary)]">
                    {getInitials(r.name)}
                  </span>
                  <div>
                    <div className="font-medium text-[var(--ink)]">{r.name}</div>
                    <div className="text-[var(--muted)]">sem comprar há {r.days} dias</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="font-semibold tabular-nums text-[var(--gain)]">{r.value}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={
                      r.risk
                        ? { background: 'color-mix(in oklab, var(--loss) 12%, transparent)', color: 'var(--loss)' }
                        : { background: 'color-mix(in oklab, var(--gain) 14%, transparent)', color: 'var(--gain)' }
                    }
                  >
                    {r.risk ? 'em risco' : 'ativo'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  to,
  prefix = '',
  suffix = '',
  tone,
}: {
  label: string
  to: number
  prefix?: string
  suffix?: string
  tone: keyof typeof TONES
}) {
  const { color, width } = TONES[tone]
  return (
    <div className="rounded-xl border border-[var(--line)] p-3">
      <div className="text-[10px] leading-tight text-[var(--muted)]">{label}</div>
      <span style={{ color }} className="mt-1 block">
        <CountUp to={to} prefix={prefix} suffix={suffix} className="text-base font-bold tabular-nums sm:text-lg" />
      </span>
      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-soft)]">
        <div className="h-full rounded-full" style={{ width, background: color }} />
      </div>
    </div>
  )
}
