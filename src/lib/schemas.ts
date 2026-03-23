import { z } from "zod"

export const signupSchema = z.object({
  full_name: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
})

export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
})

export const businessProfileSchema = z.object({
  business_name: z.string().min(1, "Business name is required"),
  industry: z.string().optional(),
  phone: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[\d\s\-\+\(\)\.]{7,20}$/.test(val),
      "Invalid phone number"
    ),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  website_url: z
    .string()
    .url("Invalid URL")
    .optional()
    .or(z.literal("")),
  city: z.string().optional(),
  state: z.string().optional(),
  description: z.string().optional(),
  services: z.array(z.string()).optional(),
  service_areas: z.array(z.string()).optional(),
})

export type SignupFormData = z.infer<typeof signupSchema>
export type LoginFormData = z.infer<typeof loginSchema>
export type BusinessProfileFormData = z.infer<typeof businessProfileSchema>

// ─────────────────────────────────────────────
// Onboarding step schemas
// ─────────────────────────────────────────────

export const INDUSTRIES = [
  'Home Services',
  'Retail',
  'Restaurant / Food & Beverage',
  'Healthcare',
  'Legal',
  'Real Estate',
  'Automotive',
  'Fitness & Wellness',
  'Beauty & Personal Care',
  'Education',
  'Financial Services',
  'Construction',
  'Technology',
  'Other',
] as const

export type Industry = (typeof INDUSTRIES)[number]

export const onboardingStep1Schema = z.object({
  business_name: z.string().min(1, 'Business name is required'),
  industry: z.string().optional(),
  phone: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[\d\s\-\+\(\)\.]{7,20}$/.test(val),
      'Invalid phone number'
    ),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  website_url: z
    .string()
    .url('Must be a valid URL (include https://)')
    .optional()
    .or(z.literal('')),
})

export const onboardingStep2Schema = z.object({
  street_address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().max(2, 'Use 2-letter state code').optional(),
  zip: z.string().max(10).optional(),
  service_areas: z.array(z.string()).default([]),
})

export const onboardingStep3Schema = z.object({
  services: z.array(z.string()).default([]),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or fewer')
    .optional(),
})

export type OnboardingStep1Data = z.infer<typeof onboardingStep1Schema>
export type OnboardingStep2Data = z.infer<typeof onboardingStep2Schema>
export type OnboardingStep3Data = z.infer<typeof onboardingStep3Schema>

export const onboardingTemplateSchema = z.object({
  template: z.string().min(1, 'Please select a template'),
  industry: z.string().optional(),
})

export type OnboardingTemplateData = z.infer<typeof onboardingTemplateSchema>
