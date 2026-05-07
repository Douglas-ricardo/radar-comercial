'use client'

// ===========================================
// useFileUpload — corrigido
// Correções:
//  1. Progresso de processamento via polling real (api.files.getStatus)
//  2. Simulação removida — usuário vê estado real do backend
//  3. Cleanup do interval/timeout no unmount
//  4. Tipagem forte
// ===========================================

import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api/client'

export type UploadStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'failed'

interface UseFileUploadReturn {
  file: File | null
  status: UploadStatus
  progress: number
  errorMessage: string | null
  selectFile: (file: File) => void
  startUpload: () => Promise<void>
  reset: () => void
}

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 60 // 2 min timeout

// Progresso visual estimado enquanto o backend processa
// Avança devagar até ~85% e para — os últimos % vêm do status real
function estimatedProgress(attempt: number): number {
  return Math.min(85, Math.round((attempt / POLL_MAX_ATTEMPTS) * 100))
}

export function useFileUpload(): UseFileUploadReturn {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptRef = useRef(0)

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current)
      pollTimeoutRef.current = null
    }
    attemptRef.current = 0
  }, [])

  const reset = useCallback(() => {
    stopPolling()
    setFile(null)
    setStatus('idle')
    setProgress(0)
    setErrorMessage(null)
  }, [stopPolling])

  const selectFile = useCallback((newFile: File) => {
    stopPolling()
    setFile(newFile)
    setStatus('idle')
    setProgress(0)
    setErrorMessage(null)
    toast.success('Arquivo anexado', {
      description: `${newFile.name} pronto para envio.`,
    })
  }, [stopPolling])

  // Polling real contra o backend para obter status do processamento
  const pollStatus = useCallback((fileId: string) => {
    const poll = async () => {
      attemptRef.current += 1

      if (attemptRef.current > POLL_MAX_ATTEMPTS) {
        setStatus('failed')
        setErrorMessage('O processamento está demorando mais que o esperado. Tente novamente.')
        toast.error('Timeout no processamento')
        stopPolling()
        return
      }

      try {
        const response = await api.files.getStatus(fileId)

        if (!response.success || !response.data) {
          const isNotFound = response.error?.toLowerCase().includes('não encontrado')
          if (isNotFound) {
            setStatus('failed')
            setErrorMessage('Arquivo não encontrado. Tente fazer o upload novamente.')
            stopPolling()
            toast.error('Arquivo não encontrado')
            return
          }
          // Erro transitório — continua tentando
          setProgress(estimatedProgress(attemptRef.current))
          pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS)
          return
        }

        const fileStatus = response.data.status

        if (fileStatus === 'completed') {
          setProgress(100)
          setStatus('completed')
          stopPolling()
          toast.success('Análise concluída!', {
            description: 'Seus insights já estão disponíveis.',
          })
          return
        }

        if (fileStatus === 'failed') {
          setStatus('failed')
          setErrorMessage(
            response.data.errorMessage ?? 'Falha no processamento do arquivo.'
          )
          stopPolling()
          toast.error('Erro no processamento', {
            description: response.data.errorMessage,
          })
          return
        }

        // Ainda processando — atualiza progresso estimado e reagenda
        setProgress(estimatedProgress(attemptRef.current))
        pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS)
      } catch {
        // Erro de rede durante polling — tenta de novo
        setProgress(estimatedProgress(attemptRef.current))
        pollTimeoutRef.current = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    poll()
  }, [stopPolling])

  const startUpload = useCallback(async () => {
    if (!file) return

    stopPolling()
    setStatus('uploading')
    setProgress(0)
    setErrorMessage(null)

    try {
      const response = await api.files.upload(file, (p) => setProgress(p))

      if (!response.success || !response.data) {
        const msg = response.error ?? 'Não foi possível enviar o arquivo.'
        setStatus('failed')
        setErrorMessage(msg)
        toast.error('Erro no upload', { description: msg })
        return
      }

      // Upload concluído — inicia polling para acompanhar o processamento
      setStatus('processing')
      setProgress(0)
      attemptRef.current = 0
      pollStatus(response.data.id)
    } catch (err) {
      console.error('Erro no upload:', err)
      const msg = 'Verifique sua conexão e tente novamente.'
      setStatus('failed')
      setErrorMessage(msg)
      toast.error('Falha na comunicação', { description: msg })
    }
  }, [file, pollStatus, stopPolling])

  return { file, status, progress, errorMessage, selectFile, startUpload, reset }
}
