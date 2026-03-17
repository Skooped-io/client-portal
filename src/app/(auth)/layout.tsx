interface AuthLayoutProps {
  children: React.ReactNode
}

export default function AuthLayout({ children }: AuthLayoutProps) {
  // Auth pages handle their own full-page layout with gradient background
  return <>{children}</>
}
