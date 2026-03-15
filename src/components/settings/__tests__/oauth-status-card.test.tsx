import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OauthStatusCard } from '../oauth-status-card'

// Mock fetch for disconnect action
global.fetch = vi.fn()

describe('OauthStatusCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('connected state', () => {
    it('shows Connected badge when status is active', () => {
      render(
        <OauthStatusCard
          provider="google"
          serviceName="Search Console"
          serviceKey="search_console"
          status="active"
          providerEmail="test@gmail.com"
        />
      )
      expect(screen.getByText('Connected')).toBeInTheDocument()
    })

    it('shows provider email when connected', () => {
      render(
        <OauthStatusCard
          provider="google"
          serviceName="Search Console"
          serviceKey="search_console"
          status="active"
          providerEmail="test@gmail.com"
        />
      )
      expect(screen.getByText('test@gmail.com')).toBeInTheDocument()
    })

    it('shows Disconnect button when connected', () => {
      render(
        <OauthStatusCard
          provider="google"
          serviceName="Search Console"
          serviceKey="search_console"
          status="active"
        />
      )
      expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument()
    })
  })

  describe('disconnected state', () => {
    it('shows Not Connected badge when status is disconnected', () => {
      render(
        <OauthStatusCard
          provider="google"
          serviceName="Google Ads"
          serviceKey="ads"
          status="disconnected"
        />
      )
      expect(screen.getByText('Not Connected')).toBeInTheDocument()
    })

    it('shows Connect button when disconnected', () => {
      render(
        <OauthStatusCard
          provider="google"
          serviceName="Google Ads"
          serviceKey="ads"
          status="disconnected"
        />
      )
      expect(screen.getByRole('button', { name: /connect/i })).toBeInTheDocument()
    })

    it('does not show provider email when disconnected', () => {
      render(
        <OauthStatusCard
          provider="google"
          serviceName="Google Ads"
          serviceKey="ads"
          status="disconnected"
        />
      )
      expect(screen.queryByText('@')).not.toBeInTheDocument()
    })
  })

  describe('error/revoked state', () => {
    it('shows Needs Reconnection badge when status is error', () => {
      render(
        <OauthStatusCard
          provider="meta"
          serviceName="Instagram"
          serviceKey="instagram"
          status="error"
        />
      )
      expect(screen.getByText('Needs Reconnection')).toBeInTheDocument()
    })

    it('shows Reconnect button when status is revoked', () => {
      render(
        <OauthStatusCard
          provider="meta"
          serviceName="Instagram"
          serviceKey="instagram"
          status="revoked"
        />
      )
      expect(screen.getByRole('button', { name: /reconnect/i })).toBeInTheDocument()
    })
  })

  describe('service name display', () => {
    it('displays the service name', () => {
      render(
        <OauthStatusCard
          provider="google"
          serviceName="Analytics"
          serviceKey="analytics"
          status="disconnected"
        />
      )
      expect(screen.getByText('Analytics')).toBeInTheDocument()
    })
  })

  describe('data-testid', () => {
    it('has correct testid for the container', () => {
      render(
        <OauthStatusCard
          provider="google"
          serviceName="Search Console"
          serviceKey="search_console"
          status="active"
        />
      )
      expect(screen.getByTestId('oauth-status-card-search_console')).toBeInTheDocument()
    })
  })
})
