//app/dashboard/history/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '@/components/dashboard/header'
import { useAuth } from '@/lib/auth/auth-context'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FileSpreadsheet,
  Search,
  MoreHorizontal,
  Eye,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Calendar,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { UploadedFile } from '@/types'

const PAGE_SIZE = 50

export default function HistoryPage() {
  const { company, user } = useAuth()

  // Tipagem forte — sem any[]
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [fileToDelete, setFileToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [total, setTotal] = useState(0)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const fetchFiles = useCallback(
    async (opts: { limit: number; offset: number; append: boolean }) => {
      // Só carrega se tiver empresa — evita spinner fantasma
      if (!company?.id) return

      const setLoading = opts.append ? setIsLoadingMore : setIsLoading
      setLoading(true)
      try {
        const response = await api.files.list({ limit: opts.limit, offset: opts.offset })
        if (response.success && Array.isArray(response.data)) {
          const rows = response.data
          setFiles((prev) => (opts.append ? [...prev, ...rows] : rows))
          setTotal(response.pagination ? response.pagination.total : rows.length)
        }
      } catch (error) {
        console.error('Erro ao carregar histórico', error)
        toast.error('Não foi possível carregar o histórico.')
      } finally {
        setLoading(false)
      }
    },
    [company?.id],
  )

  useEffect(() => {
    fetchFiles({ limit: PAGE_SIZE, offset: 0, append: false })
  }, [fetchFiles])

  const loadMore = () => fetchFiles({ limit: PAGE_SIZE, offset: files.length, append: true })

  const handleDelete = async () => {
    if (!fileToDelete) return
    setIsDeleting(true)
    try {
      const response = await api.files.delete(fileToDelete)
      if (response.success) {
        toast.success('Análise excluída com sucesso.')
        // Recarrega a janela atual (preserva o que já estava à vista).
        await fetchFiles({
          limit: Math.min(Math.max(files.length, PAGE_SIZE), 500),
          offset: 0,
          append: false,
        })
      } else {
        toast.error('Não foi possível excluir a análise.')
      }
    } catch {
      toast.error('Erro ao excluir. Tente novamente.')
    } finally {
      setIsDeleting(false)
      setDeleteDialogOpen(false)
      setFileToDelete(null)
    }
  }

  const getStatusBadge = (status: UploadedFile['status']) => {
    const config = {
      completed: {
        icon: CheckCircle,
        label: 'Concluído',
        className: 'bg-success/10 text-success',
      },
      processing: {
        icon: Loader2,
        label: 'Processando',
        className: 'bg-primary/10 text-primary',
      },
      pending: {
        icon: Loader2,
        label: 'Aguardando',
        className: 'bg-muted text-muted-foreground',
      },
      failed: {
        icon: AlertCircle,
        label: 'Erro',
        className: 'bg-destructive/10 text-destructive',
      },
    } as const

    const { icon: Icon, label, className } = config[status] ?? config.pending

    return (
      <Badge className={cn('gap-1 rounded-full border-0 font-medium', className)}>
        <Icon
          className={cn('h-3 w-3', status === 'processing' && 'animate-spin')}
          aria-hidden="true"
        />
        {label}
      </Badge>
    )
  }

  const filteredFiles = files.filter((f) =>
    f.filename.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex flex-col">
      <DashboardHeader
        title="Histórico de Análises"
        description="Visualize e gerencie todas as suas análises anteriores"
      />

      <div className="flex-1 space-y-6 p-6 lg:p-8">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              placeholder="Buscar por nome do arquivo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              aria-label="Buscar análises"
            />
          </div>
        </div>

        {searchQuery && total > files.length && (
          <p className="text-xs text-muted-foreground">
            A busca filtra apenas as {files.length} análises já carregadas — carregue mais para ampliar.
          </p>
        )}

        <Card className="rounded-2xl border-border shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Data upload</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Receita perdida</TableHead>
                  <TableHead className="text-right">Oportunidades</TableHead>
                  <TableHead className="w-[50px]">
                    <span className="sr-only">Ações</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="py-16 text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
                        <p className="text-sm">Carregando histórico...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredFiles.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="py-16">
                      <div className="flex flex-col items-center justify-center gap-4 text-center">
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
                          <FileSpreadsheet className="h-7 w-7 text-primary" aria-hidden="true" />
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-foreground">
                            {searchQuery ? 'Nenhuma análise encontrada' : 'Nenhuma análise ainda'}
                          </p>
                          <p className="text-sm text-muted-foreground max-w-xs">
                            {searchQuery
                              ? 'Tente outro termo de busca ou limpe o filtro.'
                              : 'Importe sua base de vendas para gerar a primeira análise.'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFiles.map((file) => (
                    <TableRow key={file.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent">
                            <FileSpreadsheet className="h-5 w-5 text-primary" aria-hidden="true" />
                          </div>
                          <div>
                            <p className="font-medium truncate max-w-[200px] text-foreground">{file.filename}</p>
                            <p className="text-sm text-muted-foreground">
                              por {user?.name?.split(' ')[0] ?? 'Você'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(file.uploadedAt)}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Calendar className="h-3 w-3" aria-hidden="true" />
                          Análise completa
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(file.status)}</TableCell>
                      <TableCell className="text-right">
                        {file.status === 'completed' ? (
                          <span className="font-medium text-destructive tabular-nums">
                            {formatCurrency(file.lostRevenue)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {file.status === 'completed' ? (
                          <Badge variant="secondary" className="rounded-full tabular-nums">
                            {file.opportunities ?? 0}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Ações para ${file.filename}`}>
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {file.status === 'completed' && (
                              <>
                                <DropdownMenuItem onClick={() => setSelectedFile(file)}>
                                  <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                                  Ver detalhes
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setFileToDelete(file.id)
                                setDeleteDialogOpen(true)
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {!isLoading && total > files.length && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <Button variant="outline" onClick={loadMore} disabled={isLoadingMore}>
              {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Carregar mais
            </Button>
            <p className="text-xs text-muted-foreground tabular-nums">
              {files.length} de {total} análises
            </p>
          </div>
        )}

        {/* Modal detalhes */}
        <Dialog open={!!selectedFile} onOpenChange={() => setSelectedFile(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalhes da análise</DialogTitle>
              <DialogDescription>{selectedFile?.filename}</DialogDescription>
            </DialogHeader>
            {selectedFile && (
              <div className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                    <p className="text-sm text-muted-foreground">Receita total</p>
                    <p className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.02em] tabular-nums text-foreground">
                      {formatCurrency(selectedFile.totalRevenue)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 shadow-sm">
                    <p className="text-sm text-muted-foreground">Receita perdida</p>
                    <p className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.02em] tabular-nums text-destructive">
                      {formatCurrency(selectedFile.lostRevenue)}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Oportunidades identificadas</span>
                    <span className="font-medium tabular-nums">{selectedFile.opportunities ?? 0}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Enviado por</span>
                    <span className="font-medium">{user?.name ?? 'Sistema'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Data do upload</span>
                    <span className="font-medium">{formatDate(selectedFile.uploadedAt)}</span>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedFile(null)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal confirmar exclusão */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir análise</DialogTitle>
              <DialogDescription>
                Tem certeza que deseja excluir esta análise? Esta ação não pode ser desfeita.
                Os dados de oportunidades associados também serão apagados.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {isDeleting ? 'Excluindo...' : 'Excluir'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
