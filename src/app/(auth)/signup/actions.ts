'use server'

import { createClient } from '@/lib/supabase/server'
import { signupSchema } from '@/lib/schemas'
import type { ActionResult } from '@/lib/types'

export async function signupAction(formData: FormData): Promise<ActionResult> {
  const raw = {
    full_name: formData.get('full_name') as string,
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  }

  const parsed = signupSchema.safeParse(raw)
  if (!parsed.success) {
    return { success: false, error: parsed.error.errors[0].message }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    return { success: false, error: error.message }
  }

  if (data.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: data.user.id, full_name: parsed.data.full_name })

    if (profileError) {
      console.log({ profileError })
    }
  }

  return { success: true }
}
