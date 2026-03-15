import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Get Started — Skooped',
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {children}
    </div>
  )
}
