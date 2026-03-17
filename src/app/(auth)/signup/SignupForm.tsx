'use client'

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signupAction } from "./actions"

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

export function SignupForm() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const result = await signupAction(formData)

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
        size={150}
        color="rgba(76, 175, 80, 0.2)"
        className="-top-10 -right-14"
        delay={0.2}
      />
      <IceCreamScoop
        size={100}
        color="rgba(232, 200, 122, 0.25)"
        className="top-12 -right-6"
        delay={0.4}
      />

      <IceCreamScoop
        size={130}
        color="rgba(217, 74, 122, 0.2)"
        className="-bottom-8 -left-10"
        delay={0.3}
      />
      <IceCreamScoop
        size={85}
        color="rgba(201, 144, 53, 0.22)"
        className="bottom-20 -left-2"
        delay={0.55}
      />

      <IceCreamScoop
        size={65}
        color="rgba(217, 74, 122, 0.15)"
        className="top-1/4 -left-8"
        delay={0.7}
      />
      <IceCreamScoop
        size={50}
        color="rgba(76, 175, 80, 0.18)"
        className="bottom-1/4 -right-6"
        delay={0.8}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.15 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="auth-glass-card rounded-2xl p-8">
          <div className="text-center mb-7">
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
                Create your account and let&apos;s grow
              </p>
            </motion.div>
          </div>

          <motion.form
            onSubmit={onSubmit}
            className="space-y-4"
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
              <Label htmlFor="full_name" className="text-sm font-medium text-foreground">
                Full Name
              </Label>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                placeholder="Jane Smith"
                required
                autoComplete="name"
                className="auth-input h-11"
              />
            </div>

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
                autoComplete="new-password"
                minLength={8}
                className="auth-input h-11"
              />
              <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
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
                  Creating account...
                </span>
              ) : (
                "Create account"
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
              Already have an account?{" "}
              <Link
                href="/login"
                className="text-strawberry hover:text-strawberry-600 font-semibold hover:underline transition-colors"
              >
                Sign in
              </Link>
            </p>

            <div className="flex items-center justify-center gap-2 pt-2 border-t border-border/50">
              <div className="w-1.5 h-1.5 rounded-full bg-strawberry animate-pulse" />
              <span className="text-xs text-muted-foreground font-medium">
                AI-powered onboarding in minutes
              </span>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
  )
}

export default SignupForm
