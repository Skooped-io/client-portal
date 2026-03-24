'use server'

import { createClient } from '@/lib/supabase/server'
import type { ActionResult } from '@/lib/types'

export async function forgotPasswordAction(formData: FormData): Promise<ActionResult> {
  const email = formData.get('email') as string

  if (!email || !email.includes('@')) {
    return { success: false, error: 'Please enter a valid email address' }
  }

  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  })

  if (error) {
    // Don't reveal if the email exists or not
    console.error('[forgot-password] Error:', error.message)
  }

  // Always return success to prevent email enumeration
  return { success: true }
}
