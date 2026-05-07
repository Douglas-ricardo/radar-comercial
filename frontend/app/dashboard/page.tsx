//app/dashboard/page.tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertTriangle,
  Upload,
  ArrowRight,
  FileSpreadsheet,
  Clock,
  Inbox,
} from 'lucide-react'

// Contexto & API
import { useAuth } from '@/lib/auth/auth-context'
import { api } from '@/lib/api/client'
import type { InsightsData, UploadedFile } from '@/types'

// Componentes UI Premium
import { DashboardHeader } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Empty, EmptyTitle, EmptyDescription, EmptyMedia } from '@/components/ui/empty'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Configuração do Gráfico
const chartConfig = {
  receita: {
    label: 'Receita',
    color: 'var(--color-chart-1)',
  },
  perdida: {
    label: 'Perdida',
    color: 'var(--color-destructive)',
  },
}

export default function DashboardPage() {
  const { user, company } = useAuth()
  
  // 1. Tipagem Forte aplicada
  const [insights, setInsights] = useState<InsightsData | null>(null)
  const [recentFiles, setRecentFiles] = useState<UploadedFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dateRange, setDateRange] = useState('6m')

  useEffect(() => {
    async function loadData() {
      if (!company?.id) return
      setIsLoading(true)
      try {
        const [insightsRes, filesRes] = await Promise.all([
          api.insights.get(company.id, { dateRange }),
          api.files.list()
        ])
        
        if (insightsRes.success && insightsRes.data) setInsights(insightsRes.data)
        if (filesRes.success && Array.isArray(filesRes.data)) {
          setRecentFiles(filesRes.data)
        }
      } catch (e) {
        console.error("Erro ao carregar dados reais", e)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [company, dateRange])

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
    }).format(value || 0)
  }

  // Componente Auxiliar para Skeletons dos KPIs
  const KPISkeleton = () => (
    <div className="space-y-3">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader
        title={`Olá, ${user?.name?.split(' ')[0] || 'Usuário'}`}
        description="Aqui está o resumo da sua inteligência comercial"
      />

      <div className="flex-1 space-y-8 p-6 md:p-8 max-w-[1600px] mx-auto w-full">
        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-md hover:border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Receita Total
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <DollarSign className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? <KPISkeleton /> : (
                <>
                  <div className="text-3xl font-bold tracking-tight">
                    {formatCurrency(insights?.summary?.totalRevenue || 0)}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    {(() => {
                      const growth = insights?.summary?.revenueGrowth ?? 0
                      const isUp = growth >= 0
                      return (
                        <Badge
                          variant="secondary"
                          className={isUp
                            ? 'bg-success/10 text-success hover:bg-success/20'
                            : 'bg-destructive/10 text-destructive hover:bg-destructive/20'
                          }
                        >
                          {isUp ? <TrendingUp className="mr-1 h-3 w-3" /> : <TrendingDown className="mr-1 h-3 w-3" />}
                          {isUp ? '+' : ''}{growth.toFixed(1)}%
                        </Badge>
                      )
                    })()}
                    <span className="text-muted-foreground">vs. período anterior</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden border-destructive/20 bg-destructive/5 transition-all duration-300 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-destructive/80">
                Receita Perdida
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-destructive/10">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
            </CardHeader>
            <CardContent>
               {isLoading ? <KPISkeleton /> : (
                <>
                  <div className="text-3xl font-bold tracking-tight text-destructive">
                    {formatCurrency(insights?.summary?.lostRevenue || 0)}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <Badge variant="destructive" className="bg-destructive/10 text-destructive hover:bg-destructive/20">
                      <TrendingDown className="mr-1 h-3 w-3" />
                      {insights?.summary?.lostRate || 0}%
                    </Badge>
                    <span className="text-destructive/70">do potencial total</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-md hover:border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Oportunidades
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
                <FileSpreadsheet className="h-4 w-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
               {isLoading ? <KPISkeleton /> : (
                <>
                  <div className="text-3xl font-bold tracking-tight">
                    {insights?.opportunities?.length || 0}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    vendas perdidas mapeadas
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="group relative overflow-hidden transition-all duration-300 hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Uso Mensal
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
                <Upload className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? <KPISkeleton /> : (
                <>
                  <div className="text-3xl font-bold tracking-tight">
                    {company?.uploadsUsed ?? 0} <span className="text-lg text-muted-foreground font-medium">/ {company?.uploadsLimit ?? 0}</span>
                  </div>
                  <div className="mt-3">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-1000 ease-in-out"
                        style={{ width: `${company?.uploadsLimit ? Math.min(((company.uploadsUsed) / company.uploadsLimit) * 100, 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Gráfico Principal & Quick Actions */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2 flex flex-col">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>Histórico de Desempenho</CardTitle>
                <CardDescription>
                  Receita capturada versus dinheiro deixado na mesa
                </CardDescription>
              </div>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1m">Último mês</SelectItem>
                  <SelectItem value="3m">Últimos 3 meses</SelectItem>
                  <SelectItem value="6m">Últimos 6 meses</SelectItem>
                  <SelectItem value="12m">Último ano</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="flex-1 min-h-[300px]">
              {isLoading ? (
                <Skeleton className="w-full h-full min-h-[300px] rounded-lg" />
              ) : (
                <ChartContainer config={chartConfig} className="h-full w-full min-h-[300px]">
                  <AreaChart
                    data={insights?.charts?.timeSeries || []}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="fillReceita" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="fillPerdida" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-destructive)" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="var(--color-destructive)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                    <XAxis 
                      dataKey="month" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                      tickFormatter={(value) => `R$ ${value / 1000}k`}
                      dx={-10}
                    />
                    <ChartTooltip 
                      cursor={false} 
                      content={<ChartTooltipContent indicator="dot" />} 
                    />
                    <Area
                      type="monotone"
                      dataKey="receita"
                      stroke="var(--color-chart-1)"
                      fillOpacity={1}
                      fill="url(#fillReceita)"
                      strokeWidth={2}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="perdida"
                      stroke="var(--color-destructive)"
                      fillOpacity={1}
                      fill="url(#fillPerdida)"
                      strokeWidth={2}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>Ações Rápidas</CardTitle>
              <CardDescription>Gerencie suas análises e dados</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 flex-1 flex flex-col justify-center">
              <Link href="/dashboard/upload" className="block w-full">
                <Button className="w-full justify-between h-12 hover:shadow-md transition-all" variant="default">
                  <span className="flex items-center gap-3">
                    <Upload className="h-4 w-4" />
                    Processar Nova Base
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-70" />
                </Button>
              </Link>
              <Link href="/dashboard/insights" className="block w-full">
                <Button className="w-full justify-between h-12" variant="outline">
                  <span className="flex items-center gap-3 text-muted-foreground">
                    <TrendingUp className="h-4 w-4 text-foreground" />
                    Explorar Insights
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-50" />
                </Button>
              </Link>
              <Link href="/dashboard/history" className="block w-full">
                <Button className="w-full justify-between h-12" variant="outline">
                  <span className="flex items-center gap-3 text-muted-foreground">
                    <Clock className="h-4 w-4 text-foreground" />
                    Histórico Completo
                  </span>
                  <ArrowRight className="h-4 w-4 opacity-50" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Listas Inferiores */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Uploads Recentes */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4 mb-4 border-border">
              <div>
                <CardTitle>Bases Processadas</CardTitle>
                <CardDescription>Últimos arquivos analisados</CardDescription>
              </div>
              <Link href="/dashboard/history">
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
                  Ver todas
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : recentFiles.length === 0 ? (
                <Empty className="py-6">
                  <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
                  <EmptyTitle>Nenhum upload recente</EmptyTitle>
                  <EmptyDescription>Faça seu primeiro upload para gerar insights.</EmptyDescription>
                </Empty>
              ) : (
                <div className="space-y-3">
                  {recentFiles.slice(0, 4).map((upload) => (
                    <div
                      key={upload.id}
                      className="group flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 p-3 transition-colors hover:bg-secondary/50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-background border border-border shadow-sm">
                          <FileSpreadsheet className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium leading-none mb-1 truncate max-w-[200px]">{upload.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(upload.uploadedAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                      <Badge 
                        variant={upload.status === 'completed' ? 'secondary' : 'default'} 
                        className={upload.status === 'completed' ? 'bg-success/10 text-success border-transparent' : ''}
                      >
                        {upload.status === 'completed' ? 'Concluído' : 'Processando'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Oportunidades */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4 mb-4 border-border">
              <div>
                <CardTitle>Top Oportunidades</CardTitle>
                <CardDescription>Contas com maior potencial de resgate</CardDescription>
              </div>
              <Link href="/dashboard/insights">
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
                  Ver painel
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
                </div>
              ) : !insights?.opportunities || insights.opportunities.length === 0 ? (
                <Empty className="py-6">
                   <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
                   <EmptyTitle>Tudo sob controle</EmptyTitle>
                   <EmptyDescription>Ainda não detectamos oportunidades de recuperação.</EmptyDescription>
                </Empty>
              ) : (
                <div className="space-y-3">
                  {insights.opportunities.slice(0, 4).map((opp, index) => (
                    <div
                      key={opp.id || index}
                      className="group flex items-center justify-between rounded-lg border border-border/50 bg-secondary/20 p-3 transition-colors hover:bg-secondary/50"
                    >
                      <div>
                        <p className="text-sm font-medium leading-none mb-1 truncate max-w-[200px]">{opp.customer}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <span className="truncate max-w-[120px]">{opp.product || 'Diversos'}</span>
                          <span>•</span>
                          <span>{opp.lastPurchase ? new Date(opp.lastPurchase).toLocaleDateString('pt-BR') : 'N/A'}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-success mb-0.5">
                          {formatCurrency(opp.expectedValue)}
                        </p>
                        <Badge variant="outline" className="text-[10px] px-1.5 h-4 uppercase tracking-wider font-semibold">
                          Potencial
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}