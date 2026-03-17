// Chart theme — Skooped brand palette for Recharts
// Matches the ice cream design system in tailwind.config.ts

export const chartColors = {
  strawberry: '#D94A7A',
  mint:       '#4CAF50',
  vanilla:    '#E8C87A',
  blueberry:  '#5B8DEF',
  gold:       '#C99035',
  // Dark mode specific
  gridLineDark:  'rgba(255,255,255,0.06)',
  gridLineLight: 'rgba(54,28,36,0.08)',
  axisTextDark:  'rgba(255,255,255,0.40)',
  axisTextLight: 'rgba(54,28,36,0.45)',
} as const

// Demo sparkline data for metric cards
export function generateSparklineData(trend: 'up' | 'down' | 'flat', points = 14) {
  const data: { v: number }[] = []
  let base = 50 + Math.random() * 30

  for (let i = 0; i < points; i++) {
    const noise = (Math.random() - 0.5) * 15
    if (trend === 'up') base += Math.random() * 4
    else if (trend === 'down') base -= Math.random() * 3
    data.push({ v: Math.max(5, base + noise) })
  }

  return data
}

// 30-day demo traffic data
export function generate30DayData() {
  const data: { date: string; traffic: number; impressions: number }[] = []
  let traffic = 300 + Math.random() * 100
  let impressions = 1800 + Math.random() * 400

  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

    traffic += (Math.random() - 0.4) * 40
    impressions += (Math.random() - 0.35) * 150

    data.push({
      date: label,
      traffic: Math.max(50, Math.round(traffic)),
      impressions: Math.max(200, Math.round(impressions)),
    })
  }

  return data
}
