import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Log in to your Skooped client portal to view your marketing performance dashboard.',
  robots: { index: false, follow: false },
}

export default function LoginPage() {
  return <LoginForm />
}
