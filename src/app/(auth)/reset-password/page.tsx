import type { Metadata } from 'next'
import { ResetPasswordForm } from './ResetPasswordForm'

export const metadata: Metadata = {
  title: 'Set New Password',
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />
}
