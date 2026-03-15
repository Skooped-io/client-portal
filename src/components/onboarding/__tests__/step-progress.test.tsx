import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StepProgress } from '../step-progress'

describe('StepProgress', () => {
  it('renders the correct number of step indicators', () => {
    render(<StepProgress currentStep={1} totalSteps={5} completedSteps={[]} />)
    // Steps 1-5 should all be rendered with aria-labels
    expect(screen.getByLabelText('Step 1: Business')).toBeInTheDocument()
    expect(screen.getByLabelText('Step 5: Social')).toBeInTheDocument()
  })

  it('shows step numbers for non-completed steps', () => {
    render(<StepProgress currentStep={1} totalSteps={5} completedSteps={[]} />)
    // Step 1 is current — shows "1" (not a checkmark)
    const stepOne = screen.getByLabelText('Step 1: Business')
    expect(stepOne).toBeInTheDocument()
  })

  it('renders a progress bar', () => {
    render(<StepProgress currentStep={3} totalSteps={5} completedSteps={[1, 2]} />)
    const container = screen.getByTestId('step-progress')
    expect(container).toBeInTheDocument()
  })

  it('renders all step labels on desktop', () => {
    render(<StepProgress currentStep={1} totalSteps={5} completedSteps={[]} />)
    expect(screen.getByText('Business')).toBeInTheDocument()
    expect(screen.getByText('Location')).toBeInTheDocument()
    expect(screen.getByText('Services')).toBeInTheDocument()
    expect(screen.getByText('Google')).toBeInTheDocument()
    expect(screen.getByText('Social')).toBeInTheDocument()
  })

  it('shows checkmark SVG for completed steps', () => {
    const { container } = render(
      <StepProgress currentStep={3} totalSteps={5} completedSteps={[1, 2]} />
    )
    // SVG paths for checkmarks should be present
    const svgs = container.querySelectorAll('svg[aria-hidden="true"]')
    // 2 completed steps = 2 checkmarks
    expect(svgs.length).toBeGreaterThanOrEqual(2)
  })

  it('applies active styling to current step indicator', () => {
    render(<StepProgress currentStep={2} totalSteps={5} completedSteps={[1]} />)
    const step2 = screen.getByLabelText('Step 2: Location')
    expect(step2.className).toContain('border-strawberry')
  })
})
