import type { Metadata, Viewport } from 'next'
import { Nunito, DM_Sans } from 'next/font/google'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/providers/ThemeProvider'
import './globals.css'

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-nunito',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FF6987',
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: {
    default: 'Skooped Client Portal',
    template: '%s | Skooped',
  },
  description:
    'Track your SEO rankings, Google Ads performance, social content, and more — all in one AI-powered client portal by Skooped.io.',
  metadataBase: new URL('https://portal.skooped.io'),
  openGraph: {
    type: 'website',
    siteName: 'Skooped Client Portal',
    title: 'Skooped Client Portal',
    description:
      'Your AI-powered marketing performance dashboard. SEO, Ads, Social — all in one place.',
    url: 'https://portal.skooped.io',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Skooped Client Portal — AI-powered marketing dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Skooped Client Portal',
    description: 'Your AI-powered marketing performance dashboard.',
    images: ['/og-image.png'],
  },
  robots: {
    index: false, // portal is auth-gated; marketing site handles public indexing
    follow: false,
  },
}

const orgSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Skooped.io',
  url: 'https://skooped.io',
  logo: 'https://skooped.io/logo.png',
  description:
    'Skooped is an AI-powered media marketing agency based in Franklin, Tennessee. We build custom websites and manage SEO, Google Ads, and social content for local businesses.',
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Franklin',
    addressRegion: 'TN',
    addressCountry: 'US',
  },
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    url: 'https://skooped.io/contact',
  },
  sameAs: [
    'https://www.instagram.com/skooped.io',
    'https://www.facebook.com/skoopedio',
  ],
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${nunito.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }}
        />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
          storageKey="skooped-theme"
        >
          {children}
          <Toaster
            richColors
            position="bottom-right"
            toastOptions={{
              style: {
                fontFamily: 'var(--font-dm-sans)',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
