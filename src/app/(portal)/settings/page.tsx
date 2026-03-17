'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User,
  Link2,
  Bell,
  CreditCard,
  Users,
  Camera,
  Eye,
  EyeOff,
  Check,
  X,
  RefreshCw,
  Crown,
  Mail,
  UserPlus,
  Shield,
  ChevronDown,
  Moon,
  Sun,
  Zap,
  AlertCircle,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { PageTransition } from '@/components/motion/PageTransition'
import { Skeleton, SkeletonText } from '@/components/motion/Skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { slideUp, stagger } from '@/lib/animations/variants'

// ===== Types =====

type TabId = 'account' | 'connections' | 'notifications' | 'billing' | 'team'

interface Tab {
  id: TabId
  label: string
  icon: React.ElementType
}

const TABS: Tab[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'connections', label: 'Connections', icon: Link2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'billing', label: 'Billing', icon: CreditCard },
  { id: 'team', label: 'Team', icon: Users },
]

// ===== Demo data =====

const DEMO_PROFILE = {
  name: 'Jake Anderson',
  email: 'jake@gunnsfencing.com',
  businessName: "Gunn's Fencing",
  phone: '(615) 555-0182',
}

const DEMO_TEAM = [
  { id: '1', name: 'Jake Anderson', email: 'jake@gunnsfencing.com', role: 'admin', avatar: '' },
  { id: '2', name: 'Sarah Mitchell', email: 'sarah@gunnsfencing.com', role: 'viewer', avatar: '' },
]

const DEMO_PLAN = {
  name: 'Growth',
  price: '$129',
  interval: 'month',
  features: ['SEO Monitoring', 'Google Ads Management', 'Monthly Reports', 'Social Content', '1 Team Seat'],
  usagePercent: 68,
  card: '•••• •••• •••• 4832',
  cardExpiry: '09/27',
}

// ===== Toggle Switch =====

interface ToggleSwitchProps {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}

function ToggleSwitch({ checked, onChange, label, description }: ToggleSwitchProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 shrink-0',
          checked ? 'bg-strawberry' : 'bg-muted',
        )}
      >
        <motion.span
          animate={{ x: checked ? 20 : 2 }}
          transition={{ duration: 0.15, ease: 'easeInOut' }}
          className="inline-block h-5 w-5 rounded-full bg-white shadow-sm"
        />
      </button>
    </div>
  )
}

// ===== Account Tab =====

function AccountTab() {
  const [form, setForm] = useState(DEMO_PROFILE)
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)
    setTimeout(() => {
      setIsSaving(false)
      toast.success('Profile updated')
    }, 900)
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      {/* Avatar Upload */}
      <motion.div variants={slideUp}>
        <Card className="bg-card border-border rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-nunito">Profile Photo</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-5">
              <div className="relative group">
                <Avatar className="h-20 w-20 border-2 border-strawberry/30">
                  <AvatarFallback className="bg-strawberry/10 text-strawberry text-xl font-nunito font-bold">
                    JA
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 rounded-full bg-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                  <Camera className="w-5 h-5 text-white" />
                </div>
              </div>
              <div>
                <Button variant="outline" size="sm" className="rounded-xl border-border gap-2 mb-2">
                  <Camera className="w-3.5 h-3.5" />
                  Upload Photo
                </Button>
                <p className="text-xs text-muted-foreground">PNG, JPG or WEBP. Max 2MB.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Profile Form */}
      <motion.div variants={slideUp}>
        <Card className="bg-card border-border rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-nunito">Profile Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-dm-sans">Full Name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-dm-sans">Phone Number</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-dm-sans">Email Address</Label>
                <Input
                  value={form.email}
                  readOnly
                  className="bg-muted/50 border-border rounded-xl text-muted-foreground cursor-not-allowed"
                />
                <p className="text-xs text-muted-foreground">Contact your Skooped account manager to change your email.</p>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-dm-sans">Business Name</Label>
                <Input
                  value={form.businessName}
                  onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
                  className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="w-full sm:w-auto bg-strawberry hover:bg-strawberry/90 text-white rounded-xl px-6 gap-2 min-h-[44px]"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Change Password */}
      <motion.div variants={slideUp}>
        <Card className="bg-card border-border rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-nunito">Change Password</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); toast.success('Password updated') }}>
              <div className="space-y-2">
                <Label className="text-sm font-dm-sans">Current Password</Label>
                <div className="relative">
                  <Input
                    type={showCurrentPw ? 'text' : 'password'}
                    placeholder="Enter current password"
                    className="bg-background border-border rounded-xl pr-10 focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw((p) => !p)}
                    aria-label={showCurrentPw ? 'Hide password' : 'Show password'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-dm-sans">New Password</Label>
                <div className="relative">
                  <Input
                    type={showNewPw ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    className="bg-background border-border rounded-xl pr-10 focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPw((p) => !p)}
                    aria-label={showNewPw ? 'Hide password' : 'Show password'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="outline" className="w-full sm:w-auto rounded-xl border-border px-6 min-h-[44px]">
                  Update Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </motion.div>

      {/* Dark mode preference */}
      <motion.div variants={slideUp}>
        <DarkModeCard />
      </motion.div>
    </motion.div>
  )
}

// ===== Dark Mode Card (reusable) =====

function DarkModeCard() {
  const { theme, setTheme } = useTheme()

  return (
    <Card className="bg-card border-border rounded-2xl">
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-nunito">Appearance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {theme === 'dark' ? (
              <Moon className="w-5 h-5 text-muted-foreground" />
            ) : (
              <Sun className="w-5 h-5 text-muted-foreground" />
            )}
            <div>
              <p className="text-sm font-medium text-foreground">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Switch between light and dark theme</p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={theme === 'dark'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className={cn(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 shrink-0',
              theme === 'dark' ? 'bg-strawberry' : 'bg-muted',
            )}
          >
            <motion.span
              animate={{ x: theme === 'dark' ? 20 : 2 }}
              transition={{ duration: 0.15, ease: 'easeInOut' }}
              className="inline-block h-5 w-5 rounded-full bg-white shadow-sm"
            />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}

// ===== Connections Tab =====

interface ConnectionCardProps {
  provider: 'google' | 'meta'
  isConnected: boolean
  email?: string
  services: string[]
  lastSync?: string
  onConnect: () => void
  onDisconnect: () => void
  isLoading: boolean
}

function ConnectionCard({
  provider,
  isConnected,
  email,
  services,
  lastSync,
  onConnect,
  onDisconnect,
  isLoading,
}: ConnectionCardProps) {
  const config = {
    google: {
      name: 'Google',
      logo: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      ),
      color: '#4285F4',
    },
    meta: {
      name: 'Meta / Facebook',
      logo: (
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#1877F2" xmlns="http://www.w3.org/2000/svg">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
      color: '#1877F2',
    },
  }[provider]

  return (
    <Card className="bg-card border-border rounded-2xl overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center">
              {config.logo}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{config.name}</p>
              {isConnected && email && (
                <p className="text-xs text-muted-foreground">{email}</p>
              )}
            </div>
          </div>
          <Badge
            className={cn(
              'text-[11px] px-2 py-0.5 rounded-full border',
              isConnected
                ? 'bg-mint/10 text-mint border-mint/30'
                : 'bg-muted text-muted-foreground border-border',
            )}
          >
            {isConnected ? (
              <><Check className="w-3 h-3 mr-1 inline" />Connected</>
            ) : 'Not connected'}
          </Badge>
        </div>

        {isConnected && (
          <div className="mb-4 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {services.map((s) => (
                <span key={s} className="text-[11px] bg-background border border-border rounded-full px-2 py-0.5 text-muted-foreground">
                  {s}
                </span>
              ))}
            </div>
            {lastSync && (
              <p className="text-[11px] text-muted-foreground">Last sync: {lastSync}</p>
            )}
          </div>
        )}

        {!isConnected && (
          <p className="text-xs text-muted-foreground mb-4">
            Connect your {config.name} account to enable automated reporting and ad management.
          </p>
        )}

        <div className="flex gap-2">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onDisconnect}
              disabled={isLoading}
              className="rounded-xl border-border text-muted-foreground hover:text-strawberry hover:border-strawberry/50 gap-1.5"
            >
              {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              Disconnect
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onConnect}
              disabled={isLoading}
              className="bg-strawberry hover:bg-strawberry/90 text-white rounded-xl gap-1.5"
            >
              {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Connect {config.name}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ConnectionsTab() {
  const [googleConnected, setGoogleConnected] = useState(true)
  const [metaConnected, setMetaConnected] = useState(true)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [metaLoading, setMetaLoading] = useState(false)

  function handleToggle(provider: 'google' | 'meta', connect: boolean) {
    if (provider === 'google') {
      setGoogleLoading(true)
      setTimeout(() => {
        setGoogleConnected(connect)
        setGoogleLoading(false)
        toast.success(connect ? 'Google connected' : 'Google disconnected')
      }, 1200)
    } else {
      setMetaLoading(true)
      setTimeout(() => {
        setMetaConnected(connect)
        setMetaLoading(false)
        toast.success(connect ? 'Meta connected' : 'Meta disconnected')
      }, 1200)
    }
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-4">
      <motion.div variants={slideUp}>
        <p className="text-sm text-muted-foreground mb-4">
          Connect your platforms so your Skooped team can manage ads, reports, and content on your behalf.
        </p>
      </motion.div>

      <motion.div variants={slideUp}>
        <ConnectionCard
          provider="google"
          isConnected={googleConnected}
          email="jake@gunnsfencing.com"
          services={['Search Console', 'Google Ads', 'Analytics', 'Business Profile']}
          lastSync="Today at 6:42 AM"
          onConnect={() => handleToggle('google', true)}
          onDisconnect={() => handleToggle('google', false)}
          isLoading={googleLoading}
        />
      </motion.div>

      <motion.div variants={slideUp}>
        <ConnectionCard
          provider="meta"
          isConnected={metaConnected}
          email="jake@gunnsfencing.com"
          services={['Facebook Page', 'Instagram', 'Meta Ads']}
          lastSync="Today at 6:42 AM"
          onConnect={() => handleToggle('meta', true)}
          onDisconnect={() => handleToggle('meta', false)}
          isLoading={metaLoading}
        />
      </motion.div>

      <motion.div variants={slideUp}>
        <div className="flex items-start gap-3 p-4 rounded-xl bg-strawberry/5 border border-strawberry/20">
          <AlertCircle className="w-4 h-4 text-strawberry shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Disconnecting a platform will pause all automated actions for that service. Your data is never deleted.
          </p>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ===== Notifications Tab =====

function NotificationsTab() {
  const [prefs, setPrefs] = useState({
    emailReports: true,
    slackAlerts: false,
    weeklyDigest: true,
    monthlySummary: true,
    leadAlerts: true,
    rankingChanges: false,
  })

  const [frequency, setFrequency] = useState('weekly')

  function toggle(key: keyof typeof prefs) {
    setPrefs((p) => ({ ...p, [key]: !p[key] }))
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      <motion.div variants={slideUp}>
        <Card className="bg-card border-border rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-nunito">Notification Preferences</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <ToggleSwitch
              checked={prefs.emailReports}
              onChange={() => toggle('emailReports')}
              label="Email Reports"
              description="Monthly performance reports delivered to your inbox"
            />
            <ToggleSwitch
              checked={prefs.slackAlerts}
              onChange={() => toggle('slackAlerts')}
              label="Slack Alerts"
              description="Critical updates and alerts sent to your Slack workspace"
            />
            <ToggleSwitch
              checked={prefs.weeklyDigest}
              onChange={() => toggle('weeklyDigest')}
              label="Weekly Digest"
              description="Summary of the week's performance every Monday"
            />
            <ToggleSwitch
              checked={prefs.monthlySummary}
              onChange={() => toggle('monthlySummary')}
              label="Monthly Summary"
              description="Full report generated by Riley on the 1st of each month"
            />
            <ToggleSwitch
              checked={prefs.leadAlerts}
              onChange={() => toggle('leadAlerts')}
              label="Lead Alerts"
              description="Instant notification when a new lead comes in"
            />
            <ToggleSwitch
              checked={prefs.rankingChanges}
              onChange={() => toggle('rankingChanges')}
              label="Ranking Changes"
              description="Get notified when your keywords move significantly"
            />
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={slideUp}>
        <Card className="bg-card border-border rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-nunito">Report Frequency</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">How often would you like to receive performance digests?</p>
            <div className="grid grid-cols-3 gap-2">
              {(['daily', 'weekly', 'monthly'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setFrequency(opt)}
                  className={cn(
                    'py-2 rounded-xl text-sm font-medium capitalize border transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    frequency === opt
                      ? 'bg-strawberry text-white border-strawberry'
                      : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

// ===== Billing Tab =====

function BillingTab() {
  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      {/* Current Plan */}
      <motion.div variants={slideUp}>
        <Card className="bg-card border-border rounded-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-strawberry/10 to-mint/10 px-6 py-5 border-b border-border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-strawberry flex items-center justify-center">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-nunito font-bold text-foreground text-lg">{DEMO_PLAN.name} Plan</p>
                  <p className="text-xs text-muted-foreground">Active since January 2026</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-nunito font-bold text-foreground">{DEMO_PLAN.price}</p>
                <p className="text-xs text-muted-foreground">/{DEMO_PLAN.interval}</p>
              </div>
            </div>
          </div>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-2 mb-5">
              {DEMO_PLAN.features.map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="w-3.5 h-3.5 text-mint shrink-0" />
                  {f}
                </div>
              ))}
            </div>
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>Usage this month</span>
                <span>{DEMO_PLAN.usagePercent}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${DEMO_PLAN.usagePercent}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
                  className="h-full bg-gradient-to-r from-strawberry to-mint rounded-full"
                />
              </div>
            </div>
            <Button className="w-full bg-strawberry hover:bg-strawberry/90 text-white rounded-xl gap-2">
              <Zap className="w-4 h-4" />
              Upgrade Plan
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Payment Method */}
      <motion.div variants={slideUp}>
        <Card className="bg-card border-border rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-nunito">Payment Method</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-background">
              <div className="flex items-center gap-3">
                <div className="w-10 h-7 rounded bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{DEMO_PLAN.card}</p>
                  <p className="text-xs text-muted-foreground">Expires {DEMO_PLAN.cardExpiry}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground rounded-xl">
                Update
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Billing History */}
      <motion.div variants={slideUp}>
        <Card className="bg-card border-border rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-nunito">Billing History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {[
                { date: 'Mar 1, 2026', amount: '$129.00', status: 'Paid' },
                { date: 'Feb 1, 2026', amount: '$129.00', status: 'Paid' },
                { date: 'Jan 1, 2026', amount: '$129.00', status: 'Paid' },
              ].map((invoice) => (
                <div key={invoice.date} className="flex items-center justify-between px-6 py-3">
                  <div>
                    <p className="text-sm text-foreground">{invoice.date}</p>
                    <p className="text-xs text-muted-foreground">{DEMO_PLAN.name} Plan</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-foreground">{invoice.amount}</span>
                    <Badge className="bg-mint/10 text-mint border-mint/30 text-[11px]">
                      {invoice.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

// ===== Team Tab =====

function TeamTab() {
  const [members, setMembers] = useState(DEMO_TEAM)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'admin' | 'viewer'>('viewer')
  const [isInviting, setIsInviting] = useState(false)

  function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail) return
    setIsInviting(true)
    setTimeout(() => {
      setMembers((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          name: inviteEmail.split('@')[0],
          email: inviteEmail,
          role: inviteRole,
          avatar: '',
        },
      ])
      setInviteEmail('')
      setIsInviting(false)
      toast.success(`Invite sent to ${inviteEmail}`)
    }, 1000)
  }

  function handleRemove(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id))
    toast.success('Member removed')
  }

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-6">
      {/* Members List */}
      <motion.div variants={slideUp}>
        <Card className="bg-card border-border rounded-2xl overflow-hidden">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-nunito">Team Members</CardTitle>
              <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                {members.length} members
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 px-6 py-4">
                  <Avatar className="h-9 w-9 border border-border">
                    <AvatarFallback className="bg-strawberry/10 text-strawberry text-xs font-medium">
                      {member.name.split(' ').map((n: string) => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={cn(
                        'text-[11px] capitalize px-2 py-0.5 rounded-full border',
                        member.role === 'admin'
                          ? 'bg-strawberry/10 text-strawberry border-strawberry/30'
                          : 'bg-muted text-muted-foreground border-border',
                      )}
                    >
                      {member.role === 'admin' && <Shield className="w-3 h-3 mr-1 inline" />}
                      {member.role}
                    </Badge>
                    {member.role !== 'admin' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove ${member.name}`}
                        className="min-h-[44px] min-w-[44px] p-0 text-muted-foreground hover:text-strawberry rounded-lg"
                        onClick={() => handleRemove(member.id)}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Invite Form */}
      <motion.div variants={slideUp}>
        <Card className="bg-card border-border rounded-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-nunito flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-strawberry" />
              Invite Team Member
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm font-dm-sans">Email Address</Label>
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <Input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@yourbusiness.com"
                    className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-dm-sans">Role</Label>
                <div className="relative">
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as 'admin' | 'viewer')}
                    className="w-full appearance-none bg-background border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry pr-8"
                  >
                    <option value="viewer">Viewer — can view reports and data</option>
                    <option value="admin">Admin — full access to settings</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              <Button
                type="submit"
                disabled={isInviting || !inviteEmail}
                className="w-full bg-strawberry hover:bg-strawberry/90 text-white rounded-xl gap-2"
              >
                {isInviting ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Sending Invite...</>
                ) : (
                  <><UserPlus className="w-3.5 h-3.5" />Send Invite</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  )
}

// ===== Skeleton for each tab =====

function SettingsTabSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <Skeleton className="h-5 w-40" />
          <SkeletonText lines={3} />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      ))}
    </div>
  )
}

// ===== Main Page =====

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('account')
  const [isLoading] = useState(false)

  const tabContent: Record<TabId, React.ReactNode> = {
    account: <AccountTab />,
    connections: <ConnectionsTab />,
    notifications: <NotificationsTab />,
    billing: <BillingTab />,
    team: <TeamTab />,
  }

  return (
    <PageTransition>
      <div className="px-4 py-6 md:px-6 md:py-8 lg:px-8 max-w-3xl mx-auto">
        {/* Page Header */}
        <div className="mb-8">
          <motion.h1
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xl sm:text-2xl font-nunito font-bold text-foreground"
          >
            Settings
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-muted-foreground text-sm mt-1"
          >
            Manage your account, connections, and preferences.
          </motion.p>
        </div>

        {/* Tab Bar */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="mb-6"
        >
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 overflow-x-auto scrollbar-none">
            {TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="settings-active-tab"
                      className="absolute inset-0 bg-background rounded-lg shadow-sm"
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                    />
                  )}
                  <Icon className="w-4 h-4 relative z-10 shrink-0" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </motion.div>

        {/* Tab Content */}
        {isLoading ? (
          <SettingsTabSkeleton />
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
            >
              {tabContent[activeTab]}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </PageTransition>
  )
}
