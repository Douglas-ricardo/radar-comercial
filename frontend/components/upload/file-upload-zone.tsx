//components/upload/file-upload-zone.tsx
'use client'

import { useCallback, useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { Upload, FileSpreadsheet, AlertCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void
  accept?: string
  maxSize?: number // MB
  disabled?: boolean
}

const ACCEPTED_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function FileUploadZone({
  onFileSelect,
  accept = '.csv,.xlsx,.xls',
  maxSize = 50,
  disabled = false,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const inputId = useId()
  const errorId = useId()

  const validateFile = useCallback(
    (file: File): string | null => {
      if (
        !ACCEPTED_TYPES.includes(file.type) &&
        !file.name.match(/\.(csv|xlsx|xls)$/i)
      ) {
        return 'Tipo de arquivo não suportado. Use CSV ou Excel (.xlsx, .xls)'
      }
      if (file.size / (1024 * 1024) > maxSize) {
        return `Arquivo muito grande. Máximo permitido: ${maxSize}MB`
      }
      return null
    },
    [maxSize]
  )

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file)
      if (validationError) {
        setError(validationError)
        return
      }
      setError(null)
      setSelectedFile(file)
      onFileSelect(file)
    },
    [validateFile, onFileSelect]
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!disabled) setIsDragging(true)
    },
    [disabled]
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (disabled) return
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [disabled, handleFile]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const clearFile = () => {
    setSelectedFile(null)
    setError(null)
  }

  return (
    <div className="space-y-4">
      {/* Zona de drop — acessível via label associado ao input */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative rounded-lg border-2 border-dashed p-8 text-center transition-colors',
          isDragging && !disabled ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
          disabled && 'cursor-not-allowed opacity-50',
          error && 'border-destructive'
        )}
        aria-label="Área de soltar arquivos"
      >
        {/* Input acessível — o label associado pelo htmlFor cobre toda a zona */}
        <input
          id={inputId}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          disabled={disabled}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={!!error}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />

        <div className="flex flex-col items-center gap-4">
          <div
            className={cn(
              'flex h-16 w-16 items-center justify-center rounded-full transition-colors',
              isDragging ? 'bg-primary/20' : 'bg-secondary'
            )}
            aria-hidden="true"
          >
            <Upload
              className={cn(
                'h-8 w-8 transition-colors',
                isDragging ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          </div>

          <div>
            <label
              htmlFor={inputId}
              className="text-lg font-medium cursor-pointer hover:text-primary transition-colors"
            >
              {isDragging
                ? 'Solte o arquivo aqui'
                : 'Arraste seu arquivo ou clique para selecionar'}
            </label>
            <p className="mt-1 text-sm text-muted-foreground">
              Formatos aceitos: CSV, Excel (.xlsx, .xls) — Máximo {maxSize}MB
            </p>
          </div>
        </div>
      </div>

      {/* Mensagem de erro com aria */}
      {error && (
        <div
          id={errorId}
          role="alert"
          className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Arquivo selecionado */}
      {selectedFile && !error && (
        <div className="flex items-center justify-between rounded-md border border-border bg-secondary/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
              <FileSpreadsheet className="h-5 w-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="font-medium">{selectedFile.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={clearFile}
            aria-label={`Remover arquivo ${selectedFile.name}`}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  )
}
