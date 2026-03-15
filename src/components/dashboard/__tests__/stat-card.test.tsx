import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Globe } from "lucide-react"
import { StatCard } from "../stat-card"

describe("StatCard", () => {
  it("renders the label", () => {
    render(<StatCard label="Website Visits" value={1234} icon={Globe} />)
    expect(screen.getByText("Website Visits")).toBeInTheDocument()
  })

  it("renders formatted value", () => {
    render(<StatCard label="Visits" value={1234} icon={Globe} />)
    expect(screen.getByText("1,234")).toBeInTheDocument()
  })

  it("shows no data state when value is 0", () => {
    render(<StatCard label="Visits" value={0} icon={Globe} />)
    expect(screen.getByText("No data yet")).toBeInTheDocument()
    expect(screen.queryByText("0")).not.toBeInTheDocument()
  })

  it("shows positive trend", () => {
    render(<StatCard label="Visits" value={100} icon={Globe} trend={12} />)
    expect(screen.getByText("+12% from last month")).toBeInTheDocument()
  })

  it("shows negative trend", () => {
    render(<StatCard label="Visits" value={100} icon={Globe} trend={-5} />)
    expect(screen.getByText("-5% from last month")).toBeInTheDocument()
  })

  it("does not show trend for zero value", () => {
    render(<StatCard label="Visits" value={0} icon={Globe} trend={12} />)
    expect(screen.queryByText("+12% from last month")).not.toBeInTheDocument()
  })

  it("renders with data-testid", () => {
    render(<StatCard label="Visits" value={100} icon={Globe} />)
    expect(screen.getByTestId("stat-card")).toBeInTheDocument()
  })
})
