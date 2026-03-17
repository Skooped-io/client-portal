import type { Metadata } from 'next'
import { SignupForm } from './SignupForm'

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Sign up for the Skooped client portal to onboard your business and access performance dashboards.',
  robots: { index: false, follow: false },
}

export default function SignupPage() {
  return <SignupForm />
}
