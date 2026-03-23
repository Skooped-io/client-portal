import { NextRequest, NextResponse } from 'next/server'
import { verifyServiceApiKey } from '@/lib/agents/auth'
import { createAdminClient } from '@/lib/supabase/admin'

interface AgentParams {
  params: Promise<{ orgId: string }>
}

/**
 * GET /api/agents/[orgId]/custom-prompt
 *
 * Generates a Lovable-ready build prompt from the client's business profile.
 * Used by Cooper/Jake when building custom sites in Lovable.
 * Requires SERVICE_API_KEY header.
 */
export async function GET(request: NextRequest, { params }: AgentParams) {
  if (!verifyServiceApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { orgId } = await params
  const supabase = createAdminClient()

  const { data: bp } = await supabase
    .from('business_profiles')
    .select('*')
    .eq('org_id', orgId)
    .single()

  if (!bp) {
    return NextResponse.json({ error: 'Business profile not found' }, { status: 404 })
  }

  const services = Array.isArray(bp.services) ? (bp.services as string[]).join(', ') : ''
  const serviceAreas = Array.isArray(bp.service_areas)
    ? (bp.service_areas as string[]).join(', ')
    : (bp.service_areas as string) ?? ''
  const location = [bp.city, bp.state].filter(Boolean).join(', ')

  const prompt = `Build a professional ${bp.industry ?? 'business'} website for ${bp.business_name ?? 'this business'}.

## Business Details
- **Business Name:** ${bp.business_name ?? 'Not provided'}
- **Industry:** ${bp.industry ?? 'Not provided'}
- **Location:** ${location || 'Not provided'}
- **Service Areas:** ${serviceAreas || location || 'Not provided'}
- **Phone:** ${bp.phone ?? 'Not provided'}
- **Email:** ${bp.email ?? 'Not provided'}
- **Services:** ${services || 'Not provided'}
- **Description:** ${bp.description ?? 'Not provided'}

## Design Requirements
- **Primary Color:** ${(bp as Record<string, unknown>).primary_color ?? '#DC2626'}
- **Font Style:** ${(bp as Record<string, unknown>).font_style ?? 'modern'}
- **Mobile-first responsive design**
- **Fast loading (Core Web Vitals optimized)**

## Required Sections
1. **Hero** — Strong headline with CTA ("Get a Free Estimate" or relevant CTA)
2. **Services Grid** — Cards for each service with icon, title, short description
3. **About Section** — Business story, owner info, trust signals
4. **Why Choose Us** — 4 trust items (Licensed & Insured, Local, Experience, Guarantee)
5. **Process** — 4-step process (Consultation → Quote → Work → Complete)
6. **Testimonials** — 3 placeholder reviews with 5-star ratings
7. **Gallery** — 6-image portfolio grid with placeholder images
8. **FAQ** — 5-6 common questions for the industry
9. **Contact Form** — Name, Phone, Email, Message, Submit button
10. **Footer** — Logo, nav links, contact info, social links, copyright

## Technical Requirements
- **Config-driven architecture:** All business data loaded from \`siteConfig.json\` at runtime
- **No hardcoded business names** in components — use config variables
- **Schema.org LocalBusiness markup** in document head
- **Google Analytics 4** gtag.js snippet in document head (configurable measurement ID)
- **Contact form** POSTs to \`https://app.skooped.io/api/contact\` with \`{ orgId, name, email, phone, message }\`
- **Meta tags** — title, description, og:title, og:description all from config

## siteConfig.json Structure
The site reads from a \`siteConfig.json\` file in the project root:
\`\`\`json
{
  "businessName": "${bp.business_name ?? ''}",
  "phone": "${bp.phone ?? ''}",
  "email": "${bp.email ?? ''}",
  "city": "${bp.city ?? ''}",
  "state": "${bp.state ?? ''}",
  "services": ${JSON.stringify(Array.isArray(bp.services) ? bp.services : [])},
  "industry": "${bp.industry ?? ''}",
  "description": "${(bp.description ?? '').replace(/"/g, '\\"')}",
  "ga4MeasurementId": "",
  "orgId": "${orgId}"
}
\`\`\`

## Important Notes
- Make it look custom and professional, NOT like a template
- Use the business name throughout but load it from siteConfig
- All placeholder images should use imageSlot variables (hero_1, gallery_1, etc.)
- The contact form should show a success toast and reset on submission
- Include a sticky header with mobile hamburger menu`

  return NextResponse.json({ prompt, orgId, businessName: bp.business_name })
}
