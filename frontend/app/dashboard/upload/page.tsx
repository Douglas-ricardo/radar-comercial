//app/dashboard/upload/page.tsx
'use client'

import { useRouter } from 'next/navigation'
import { Download, Lightbulb, TableProperties } from 'lucide-react'

import { DashboardHeader } from '@/components/dashboard/header'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useFileUpload } from '@/hooks/use-file-upload'
import {
  IdleState,
  ConfirmState,
  InProgressState,
  CompletedState,
} from '@/components/upload/upload-states'
import { UploadStepper } from '@/components/upload/upload-stepper'

const REQUIRED_COLUMNS = [
  { name: 'data', desc: 'DD/MM/YYYY ou YYYY-MM-DD' },
  { name: 'cliente', desc: 'Nome, razão social ou CNPJ' },
  { name: 'produto', desc: 'Nome, SKU ou ID do produto' },
  { name: 'quantidade', desc: 'Número inteiro ou decimal' },
  { name: 'valor', desc: 'Valor total sem símbolo R$' },
] as const

const TIPS = [
  'Envie um histórico longo — ideal 12 a 24 meses.',
  'Não deixe valores nulos nas colunas obrigatórias.',
  'Remova linhas de totais ou formatações visuais do Excel.',
]

const CSV_TEMPLATE_ROWS = [
  'data,cliente,produto,quantidade,valor',
  '01/01/2024,Empresa ABC Ltda,Produto Premium,5,2500.00',
  '15/01/2024,Comércio XYZ,Serviço Mensal,1,890.00',
  '20/02/2024,Indústria Beta,Produto Standard,12,360.00',
].join('\n')

function downloadTemplate(filename: string) {
  const blob = new Blob(['﻿' + CSV_TEMPLATE_ROWS], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function UploadPage() {
  const router = useRouter()
  const { file, status, progress, errorMessage, selectFile, startUpload, reset } =
    useFileUpload()

  const isIdle = status === 'idle'
  const isFailed = status === 'failed'
  const isInProgress = status === 'uploading' || status === 'processing'
  const isCompleted = status === 'completed'
  const hasFile = file !== null

  function renderMainArea() {
    if (isCompleted) {
      return (
        <CompletedState
          onNewUpload={reset}
          onViewInsights={() => router.push('/dashboard/insights')}
        />
      )
    }

    if (isInProgress && file) {
      return (
        <InProgressState
          file={file}
          status={status as 'uploading' | 'processing'}
          progress={progress}
        />
      )
    }

    if (hasFile && (isIdle || isFailed)) {
      return (
        <ConfirmState
          file={file}
          status={status}
          errorMessage={errorMessage}
          onUpload={startUpload}
          onReset={reset}
        />
      )
    }

    return <IdleState onFileSelect={selectFile} />
  }

  return (
    <div className="flex flex-col min-h-screen">
      <DashboardHeader
        title="Importar dados"
        description="Faça o upload da sua base histórica de vendas para gerar insights."
      />

      <div className="flex-1 p-6 md:p-8 max-w-[960px] mx-auto w-full space-y-8">
        <div className="min-h-[60px] flex items-center justify-center">
          {(hasFile || isCompleted) && <UploadStepper status={status} />}
        </div>

        <div className="grid gap-8 lg:grid-cols-3 xl:gap-10 items-start">
          {/* Coluna principal */}
          <Card className="lg:col-span-2 rounded-2xl border-border shadow-sm">
            <CardHeader>
              <CardTitle className="font-[family-name:var(--font-display)] text-xl font-bold tracking-[-0.02em]">
                {isCompleted ? 'Processamento concluído' : 'Área de upload'}
              </CardTitle>
              {!isCompleted && (
                <CardDescription>
                  Arraste seu arquivo CSV ou Excel (.xlsx) com o histórico de vendas.
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>{renderMainArea()}</CardContent>
          </Card>

          {/* Coluna lateral — documentação */}
          <aside className="space-y-6" aria-label="Instruções de upload">
            <Card className="rounded-2xl border-border shadow-sm overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 font-[family-name:var(--font-display)] text-base font-bold tracking-[-0.02em]">
                  <TableProperties className="h-5 w-5 text-primary" aria-hidden="true" />
                  Estrutura do arquivo
                </CardTitle>
                <CardDescription className="text-xs">
                  O arquivo deve conter exatamente estas colunas.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <dl className="divide-y divide-border border-t border-border">
                  {REQUIRED_COLUMNS.map((col) => (
                    <div
                      key={col.name}
                      className="px-6 py-3 hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-xs font-mono font-medium bg-muted px-1.5 py-0.5 rounded text-foreground">
                          {col.name}
                        </code>
                        <dt className="text-[10px] font-bold uppercase tracking-wider text-destructive">
                          obrigatório
                        </dt>
                      </div>
                      <dd className="text-xs text-muted-foreground">{col.desc}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
              <CardFooter className="flex-col gap-2 pt-4 border-t border-border bg-muted/20">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
                  onClick={() => downloadTemplate('template_radar_comercial.csv')}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Baixar modelo (CSV)
                </Button>
                <p className="px-1 text-[11px] text-muted-foreground">
                  Abre direto no Excel e no Google Sheets.
                </p>
              </CardFooter>
            </Card>

            <div className="rounded-2xl border border-warning/30 bg-warning/[0.06] p-5 shadow-sm">
              <div className="flex gap-3">
                <Lightbulb className="h-5 w-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-warning-foreground mb-2">
                    Dicas para melhor precisão
                  </p>
                  <ul className="space-y-2" aria-label="Dicas de upload">
                    {TIPS.map((tip) => (
                      <li
                        key={tip}
                        className="text-xs text-muted-foreground flex gap-2 leading-relaxed"
                      >
                        <span
                          className="mt-1.5 h-1.5 w-1.5 rounded-full bg-warning shrink-0"
                          aria-hidden="true"
                        />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
