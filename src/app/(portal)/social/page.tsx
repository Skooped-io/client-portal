import type { Metadata } from 'next'
import SocialPage from './social-client'

export const metadata: Metadata = { title: 'Social' }
export const revalidate = 300

export default function SocialServerPage() {
  return <SocialPage />
}
