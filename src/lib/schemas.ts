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
