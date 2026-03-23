-- Seed Test Metric Data — simplified version
-- Run: psql connection_string -f scripts/seed-test-metrics.sql

DO $$
DECLARE
  oid uuid := 'fe733076-96c9-4c98-925d-fc4b4b7d92e7';
  d date;
  i integer;
BEGIN
  -- SEO Metrics (30 days)
  FOR i IN 0..29 LOOP
    d := CURRENT_DATE - i;
    INSERT INTO seo_metrics (org_id, date, total_clicks, total_impressions, avg_ctr, avg_position, top_queries, top_pages, site_url)
    VALUES (
      oid, d,
      90 + (30 - i) * 3 + (i % 7) * 5,
      2800 + (30 - i) * 40 + (i % 5) * 80,
      round((0.032 + (30 - i) * 0.0005)::numeric, 4),
      round((9.5 - (30 - i) * 0.06)::numeric, 2),
      '[{"query":"roofing contractor franklin tn","clicks":22,"impressions":420,"ctr":0.052,"position":3.2},{"query":"roof repair near me","clicks":17,"impressions":380,"ctr":0.041,"position":5.1},{"query":"best roofer franklin","clicks":13,"impressions":290,"ctr":0.038,"position":4.7},{"query":"emergency roof repair tn","clicks":9,"impressions":210,"ctr":0.035,"position":7.3},{"query":"metal roofing installation","clicks":7,"impressions":190,"ctr":0.031,"position":9.1}]'::jsonb,
      '[{"page":"/","clicks":42,"impressions":1300},{"page":"/services","clicks":28,"impressions":620},{"page":"/contact","clicks":19,"impressions":410},{"page":"/about","clicks":11,"impressions":310}]'::jsonb,
      'https://jakes-roofingco.skooped.io'
    ) ON CONFLICT (org_id, date) DO NOTHING;
  END LOOP;

  -- Analytics Metrics (30 days)
  FOR i IN 0..29 LOOP
    d := CURRENT_DATE - i;
    INSERT INTO analytics_metrics (org_id, date, sessions, users, pageviews, bounce_rate, avg_session_duration, traffic_sources, top_pages, property_id)
    VALUES (
      oid, d,
      65 + (30 - i) * 2 + (i % 5) * 4,
      48 + (30 - i) + (i % 4) * 3,
      (65 + (30 - i) * 2) * 2,
      round((45 - (30 - i) * 0.2)::numeric, 2),
      round((100 + (30 - i) * 1.5)::numeric, 2),
      '[{"source":"Google Search","sessions":48,"percentage":52},{"source":"Direct","sessions":19,"percentage":21},{"source":"Google Maps","sessions":13,"percentage":14},{"source":"Facebook","sessions":7,"percentage":8},{"source":"Referral","sessions":5,"percentage":5}]'::jsonb,
      '[{"page":"/","views":65},{"page":"/services","views":38},{"page":"/contact","views":27},{"page":"/gallery","views":16}]'::jsonb,
      '456789012'
    ) ON CONFLICT (org_id, date) DO NOTHING;
  END LOOP;

  -- GBP Metrics (30 days)
  FOR i IN 0..29 LOOP
    d := CURRENT_DATE - i;
    INSERT INTO gbp_metrics (org_id, date, total_reviews, avg_rating, new_reviews, search_views, map_views, website_clicks, direction_requests, phone_calls, recent_reviews)
    VALUES (
      oid, d,
      47 + (30 - i) / 5,
      4.7,
      CASE WHEN i % 4 = 0 THEN 1 ELSE 0 END,
      180 + (30 - i) * 2,
      95 + (30 - i),
      22 + (i % 6),
      8 + (i % 4),
      5 + (i % 3),
      '[{"author":"Sarah M.","rating":5,"text":"Outstanding roofing work! Professional and on time.","date":"2026-03-20"},{"author":"James T.","rating":5,"text":"Best roofer in Franklin. Honest pricing.","date":"2026-03-18"},{"author":"Linda R.","rating":4,"text":"Good job on our roof repair.","date":"2026-03-15"}]'::jsonb
    ) ON CONFLICT (org_id, date) DO NOTHING;
  END LOOP;

  -- Ads Metrics (30 days)
  FOR i IN 0..29 LOOP
    d := CURRENT_DATE - i;
    INSERT INTO ads_metrics (org_id, date, total_spend, total_clicks, total_impressions, total_conversions, avg_cpc, avg_ctr, campaigns)
    VALUES (
      oid, d,
      round((28 + (i % 7) * 2)::numeric, 2),
      35 + (i % 8) * 3,
      850 + (30 - i) * 10,
      3 + (i % 4),
      round((0.78 + (i % 5) * 0.05)::numeric, 2),
      round((0.038 + (30 - i) * 0.0003)::numeric, 4),
      '[{"name":"Franklin Roofing - Search","spend":20.50,"clicks":24,"impressions":540,"conversions":3},{"name":"Emergency Roof Repair","spend":10.25,"clicks":11,"impressions":290,"conversions":1}]'::jsonb
    ) ON CONFLICT (org_id, date) DO NOTHING;
  END LOOP;

  -- Social Metrics (14 days, Instagram)
  FOR i IN 0..13 LOOP
    d := CURRENT_DATE - i;
    INSERT INTO social_metrics (org_id, date, platform, followers, engagement_rate, reach, impressions, posts_published, top_posts)
    VALUES (
      oid, d,
      'instagram',
      312 + (14 - i) * 3,
      round((0.038 + (14 - i) * 0.001)::numeric, 4),
      180 + (14 - i) * 5,
      350 + (14 - i) * 10,
      CASE WHEN i % 3 = 0 THEN 1 ELSE 0 END,
      '[{"id":"ig_001","caption":"New roof installation in Franklin! 🏠","likes":28,"comments":4,"shares":2},{"id":"ig_002","caption":"Before and after roof repair 🔨","likes":21,"comments":3,"shares":1}]'::jsonb
    ) ON CONFLICT (org_id, date, platform) DO NOTHING;
  END LOOP;

  -- Agent Activity
  INSERT INTO agent_activity (org_id, agent, action_type, description, created_at) VALUES
    (oid, 'scout', 'data_sync', 'Daily data sync: Search Console, Business Profile, Analytics', now() - interval '2 hours'),
    (oid, 'scout', 'seo_audit', 'Weekly SEO audit completed. Health score: 78%', now() - interval '6 hours'),
    (oid, 'scout', 'keyword_tracking', 'Tracked 5 keywords. "roofing contractor franklin tn" moved from #5 to #3', now() - interval '1 day'),
    (oid, 'bob', 'site_deploy', 'Website deployed to jakes-roofingco.skooped.io', now() - interval '2 days'),
    (oid, 'bob', 'site_update', 'Updated business hours on website', now() - interval '3 days'),
    (oid, 'scout', 'data_sync', 'Daily data sync: Search Console, Analytics', now() - interval '1 day 2 hours'),
    (oid, 'cooper', 'onboarding', 'New client onboarded: Jake''s RoofingCo', now() - interval '5 days'),
    (oid, 'scout', 'gbp_review', 'New 5-star review detected from Sarah M.', now() - interval '4 days'),
    (oid, 'sierra', 'content_post', 'Scheduled Instagram post: "New roof installation in Franklin!"', now() - interval '3 days'),
    (oid, 'scout', 'ranking_alert', 'Position improved: "best roofer franklin" from #7 to #5', now() - interval '5 days'),
    (oid, 'bob', 'performance_check', 'Lighthouse score: 94/100. Core Web Vitals: all green', now() - interval '6 days'),
    (oid, 'riley', 'report_generated', 'Weekly performance report generated', now() - interval '7 days'),
    (oid, 'cooper', 'client_message', 'Responded to client inquiry about service areas', now() - interval '4 days');

  -- Site Deployment
  INSERT INTO site_deployments (org_id, site_url, repo_name, status, template, deployed_at)
  VALUES (oid, 'https://jakes-roofingco.skooped.io', 'site-jakes-roofingco', 'live', 'Roofing', now() - interval '5 days');

  -- Reports
  INSERT INTO reports (org_id, report_type, period_start, period_end, summary, metrics, highlights) VALUES
  (oid, 'weekly', CURRENT_DATE - 14, CURRENT_DATE - 7,
    'Strong week for organic search. Clicks up 12% week-over-week. Three new 5-star reviews received.',
    '{"clicks":847,"impressions":24500,"sessions":612,"avg_position":8.2,"new_reviews":3,"phone_calls":34}'::jsonb,
    '["Organic clicks up 12% WoW","3 new 5-star Google reviews","roofing contractor franklin tn moved to #3","Google Maps traffic up 18%"]'::jsonb),
  (oid, 'weekly', CURRENT_DATE - 7, CURRENT_DATE,
    'Continued growth in search visibility. Average position improved to 7.8. Ad spend ROI at 3.2x.',
    '{"clicks":952,"impressions":27200,"sessions":689,"avg_position":7.8,"new_reviews":2,"phone_calls":38}'::jsonb,
    '["Organic clicks up 12% WoW","Avg position improved 8.2 to 7.8","Ad spend ROI: 3.2x","2 new 5-star reviews"]'::jsonb);

  RAISE NOTICE 'Seed data inserted for org %', oid;
END $$;
