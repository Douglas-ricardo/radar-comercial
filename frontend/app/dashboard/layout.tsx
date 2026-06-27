//app/dashboard/layout.tsx
'use client'

import { ProtectedRoute } from '@/lib/auth/protected-route'
import { DashboardSidebar } from '@/components/dashboard/sidebar'
import { BottomNav } from '@/components/dashboard/bottom-nav'
import { CommandMenu } from '@/components/dashboard/command-menu'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden bg-background">
        <DashboardSidebar />
        {/* pb-20 no mobile: espaço para o conteúdo não ficar atrás da bottom nav fixa */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-20 md:pb-0" id="main-content">
          {children}
        </main>
      </div>
      <BottomNav />
      <CommandMenu />
    </ProtectedRoute>
  )
}
