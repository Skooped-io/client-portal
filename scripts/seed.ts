/**
 * Seed script — development/demo data only
 * Run: npx tsx scripts/seed.ts
 *
 * Uses the service role key to bypass RLS.
 * Creates a test org, business profile, and 30 days of sample analytics data.
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split("T")[0]
}

async function seed() {
  console.log("🌱 Starting seed...")

  // 1. Upsert organization
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .upsert(
      { name: "Skooped", slug: "skooped", plan: "pro", status: "active" },
      { onConflict: "slug", ignoreDuplicates: false }
    )
    .select()
    .single()

  if (orgError) {
    console.error("Failed to upsert org:", { orgError })
    process.exit(1)
  }

  const orgId = org.id
  console.log(`✅ Organization: ${org.name} (${orgId})`)

  // 2. Upsert business profile
  const { error: profileError } = await supabase
    .from("business_profiles")
    .upsert(
      {
        org_id: orgId,
        business_name: "Skooped Marketing",
        industry: "Marketing Agency",
        phone: "6155551234",
        email: "hello@skooped.io",
        website_url: "https://skooped.io",
        city: "Franklin",
        state: "TN",
        description:
          "Skooped is a creative marketing agency based in Franklin, TN. We help local businesses grow with SEO, social media, and digital advertising.",
        services: ["SEO", "Social Media", "Google Ads", "Website Design"],
        service_areas: ["Franklin", "Nashville", "Brentwood", "Murfreesboro"],
      },
      { onConflict: "org_id", ignoreDuplicates: false }
    )

  if (profileError) {
    console.error("Failed to upsert business profile:", { profileError })
  } else {
    console.log("✅ Business profile upserted")
  }

  // 3. Generate 30 days of analytics_daily data
  const analyticsDays = Array.from({ length: 30 }, (_, i) => ({
    org_id: orgId,
    date: daysAgo(29 - i),
    sessions: randomBetween(80, 300),
    pageviews: randomBetween(200, 800),
    bounce_rate: parseFloat((randomBetween(30, 65) / 100).toFixed(2)),
  }))

  const { error: analyticsError } = await supabase
    .from("analytics_daily")
    .upsert(analyticsDays, { onConflict: "org_id,date", ignoreDuplicates: false })

  if (analyticsError) {
    console.error("Failed to seed analytics_daily:", { analyticsError })
  } else {
    console.log(`✅ Seeded ${analyticsDays.length} days of analytics data`)
  }

  // 4. Generate 30 days of gsc_daily data
  const gscDays = Array.from({ length: 30 }, (_, i) => ({
    org_id: orgId,
    date: daysAgo(29 - i),
    clicks: randomBetween(20, 150),
    impressions: randomBetween(500, 3000),
    avg_position: parseFloat((randomBetween(30, 90) / 10).toFixed(1)),
  }))

  const { error: gscError } = await supabase
    .from("gsc_daily")
    .upsert(gscDays, { onConflict: "org_id,date", ignoreDuplicates: false })

  if (gscError) {
    console.error("Failed to seed gsc_daily:", { gscError })
  } else {
    console.log(`✅ Seeded ${gscDays.length} days of GSC data`)
  }

  // 5. Generate 30 days of gbp_daily data
  const gbpDays = Array.from({ length: 30 }, (_, i) => ({
    org_id: orgId,
    date: daysAgo(29 - i),
    phone_calls: randomBetween(2, 15),
    direction_requests: randomBetween(1, 10),
  }))

  const { error: gbpError } = await supabase
    .from("gbp_daily")
    .upsert(gbpDays, { onConflict: "org_id,date", ignoreDuplicates: false })

  if (gbpError) {
    console.error("Failed to seed gbp_daily:", { gbpError })
  } else {
    console.log(`✅ Seeded ${gbpDays.length} days of GBP data`)
  }

  // 6. Seed a few GBP reviews
  const reviews = [
    {
      org_id: orgId,
      rating: 5,
      review_text: "Amazing team — our website traffic doubled in 3 months!",
      reply_text: "Thank you so much! We love working with you.",
    },
    {
      org_id: orgId,
      rating: 5,
      review_text: "Skooped transformed our social media presence. Highly recommend.",
      reply_text: null,
    },
    {
      org_id: orgId,
      rating: 4,
      review_text: "Great communication and results. Will continue working with them.",
      reply_text: "Thanks for the kind words!",
    },
  ]

  const { error: reviewsError } = await supabase.from("gbp_reviews").upsert(reviews)

  if (reviewsError) {
    console.error("Failed to seed gbp_reviews:", { reviewsError })
  } else {
    console.log(`✅ Seeded ${reviews.length} GBP reviews`)
  }

  console.log("\n🎉 Seed complete!")
  console.log(`Org ID: ${orgId}`)
  console.log("Add this org_id to organization_members for your test user to see data.")
}

seed().catch((err) => {
  console.error({ err })
  process.exit(1)
})
