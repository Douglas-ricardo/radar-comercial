//app/dashboard/layout.tsx
'use client'

import { ProtectedRoute } from '@/lib/auth/protected-route'
import { DashboardSidebar } from '@/components/dashboard/sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden bg-background">
        <DashboardSidebar />
        <main className="flex-1 overflow-y-auto" id="main-content">
          {children}
        </main>
      </div>
    </ProtectedRoute>
  )
}
