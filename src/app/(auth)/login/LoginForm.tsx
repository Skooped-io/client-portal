'use client'

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { loginAction } from "./actions"

function IceCreamScoop({
  className,
  size = 120,
  color,
  delay = 0,
}: {
  className?: string
  size?: number
  color: string
  delay?: number
}) {
  return (
    <motion.div
      className={`absolute rounded-full pointer-events-none ${className}`}
      style={{
        width: size,
        height: size * 0.92,
        background: color,
        filter: 'blur(1px)',
      }}
      initial={{ opacity: 0, scale: 0.6, y: 30 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 1.2, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
    />
  )
}

function ScoopDrip({ className, color, delay = 0 }: { className?: string; color: string; delay?: number }) {
  return (
    <motion.div
      className={`absolute pointer-events-none ${className}`}
      initial={{ opacity: 0, scaleY: 0 }}
      animate={{ opacity: 1, scaleY: 1 }}
      transition={{ duration: 0.8, delay: delay + 0.4, ease: 'easeOut' }}
      style={{ transformOrigin: 'top center' }}
    >
      <svg width="14" height="32" viewBox="0 0 14 32" fill="none">
        <path d="M7 0 C7 0 10 8 10 16 C10 22 7 28 7 32 C7 28 4 22 4 16 C4 8 7 0 7 0Z" fill={color} opacity={0.6} />
      </svg>
    </motion.div>
  )
}

export function LoginForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const result = await loginAction(formData)

    if (result.success) {
      router.push("/dashboard")
      router.refresh()
    } else {
      setError(result.error)
      setIsLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute inset-0 ice-cream-bg-gradient" aria-hidden="true" />

      <IceCreamScoop
        size={160}
        color="rgba(217, 74, 122, 0.22)"
        className="-top-12 -left-16"
        delay={0.2}
      />
      <IceCreamScoop
        size={110}
        color="rgba(232, 200, 122, 0.28)"
        className="top-8 -left-8"
        delay={0.4}
      />
      <ScoopDrip color="#D94A7A" className="top-20 left-14" delay={0.6} />

      <IceCreamScoop
        size={140}
        color="rgba(76, 175, 80, 0.2)"
        className="-bottom-10 -right-12"
        delay={0.3}
      />
      <IceCreamScoop
        size={90}
        color="rgba(201, 144, 53, 0.25)"
        className="bottom-16 -right-4"
        delay={0.5}
      />
      <ScoopDrip color="#4CAF50" className="bottom-32 right-16" delay={0.7} />

      <IceCreamScoop
        size={70}
        color="rgba(217, 74, 122, 0.15)"
        className="top-1/3 -right-8"
        delay={0.6}
      />
      <IceCreamScoop
        size={55}
        color="rgba(232, 200, 122, 0.2)"
        className="bottom-1/3 -left-6"
        delay={0.8}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.15 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="auth-glass-card rounded-2xl p-8">
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.35 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-strawberry shadow-strawberry-glow mb-4"
            >
              <span className="text-white font-nunito font-bold text-2xl">S</span>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
            >
              <h1 className="font-nunito font-extrabold text-3xl text-foreground mb-1">
                Get Skooped
              </h1>
              <p className="text-sm text-muted-foreground">
                Sign in to your client portal
              </p>
            </motion.div>
          </div>

          <motion.form
            onSubmit={onSubmit}
            className="space-y-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.4 }}
          >
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive"
              >
                {error}
              </motion.div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-foreground">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="auth-input h-11"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-foreground">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="auth-input h-11"
              />
            </div>

            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-strawberry transition-colors"
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold bg-strawberry hover:bg-strawberry-600 text-white shadow-strawberry-glow transition-all hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 rounded-xl"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                  />
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </motion.form>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.75, duration: 0.4 }}
            className="mt-6 text-center space-y-3"
          >
            <p className="text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/signup"
                className="text-strawberry hover:text-strawberry-600 font-semibold hover:underline transition-colors"
              >
                Sign up
              </Link>
            </p>

            <div className="flex items-center justify-center gap-2 pt-2 border-t border-border/50">
              <div className="w-1.5 h-1.5 rounded-full bg-strawberry animate-pulse" />
              <span className="text-xs text-muted-foreground font-medium">
                Powered by AI · Built for your business
              </span>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

export default LoginForm
