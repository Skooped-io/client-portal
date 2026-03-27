'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'

interface MobileWelcomeCardProps {
  show: boolean
  onDismiss: () => void
}

export function MobileWelcomeCard({ show, onDismiss }: MobileWelcomeCardProps) {
  return (
    <AnimatePresence>
      {show && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[9990]"
            onClick={onDismiss}
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[9991] max-w-sm mx-auto rounded-xl border border-border/60 shadow-2xl overflow-hidden"
            style={{ background: 'var(--card, #F2E8D6)' }}
          >
            {/* Strawberry accent line */}
            <div className="h-1 bg-gradient-to-r from-strawberry via-vanilla-500 to-strawberry" />

            <div className="p-6">
              <h2 className="font-nunito font-bold text-lg text-foreground mb-4">
                Welcome to your dashboard! 🎉
              </h2>

              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2.5">
                  <span className="text-base leading-none mt-0.5">📊</span>
                  <span>Your business overview is right here on the main page</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-base leading-none mt-0.5">💬</span>
                  <span>Ask Cooper anything using the chat button</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-base leading-none mt-0.5">📈</span>
                  <span>Check your analytics and reports anytime</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="text-base leading-none mt-0.5">⚙️</span>
                  <span>Head to Settings to customize your experience</span>
                </li>
              </ul>

              <Button
                onClick={onDismiss}
                className="w-full mt-6 bg-strawberry hover:bg-strawberry/90 text-white rounded-xl h-10 text-sm font-semibold"
              >
                Got it!
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
