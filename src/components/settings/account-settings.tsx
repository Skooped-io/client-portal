'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

interface AccountSettingsProps {
  email: string
}

export function AccountSettings({ email }: AccountSettingsProps) {
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [passwordForm, setPasswordForm] = useState({
    newPassword: '',
    confirmPassword: '',
  })

  async function onPasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (passwordForm.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    setIsUpdatingPassword(true)

    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      password: passwordForm.newPassword,
    })

    if (error) {
      console.error({ error })
      toast.error('Failed to update password')
    } else {
      toast.success('Password updated successfully')
      setPasswordForm({ newPassword: '', confirmPassword: '' })
    }

    setIsUpdatingPassword(false)
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card border-border rounded-xl">
        <CardHeader>
          <CardTitle className="text-base font-nunito">Email Address</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label className="text-sm font-dm-sans text-foreground">Current email</Label>
            <Input
              value={email}
              readOnly
              className="bg-background border-border rounded-xl text-muted-foreground cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              Contact your Skooped account manager to change your email address.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border rounded-xl">
        <CardHeader>
          <CardTitle className="text-base font-nunito">Change Password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onPasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-sm font-dm-sans text-foreground">
                New Password
              </Label>
              <Input
                id="newPassword"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                placeholder="At least 8 characters"
                minLength={8}
                required
                className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-dm-sans text-foreground">
                Confirm New Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Repeat your new password"
                minLength={8}
                required
                className="bg-background border-border rounded-xl focus:ring-2 focus:ring-strawberry/20 focus:border-strawberry"
              />
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={isUpdatingPassword}
                className="bg-strawberry hover:bg-strawberry/90 text-white rounded-xl px-6"
              >
                {isUpdatingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
