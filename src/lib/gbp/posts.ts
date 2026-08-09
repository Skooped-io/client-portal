import { gbpFetch } from './client'

/**
 * v4 localPosts — publish approved GBP posts. v1 keeps posts as STANDARD
 * topic type (+ optional CTA + one photo); EVENT/OFFER post types are named
 * skipped polish in the spec.
 *
 * Constraint that shapes the pipeline: media is pulled by Google from a
 * publicly fetchable sourceUrl — a Drive link or private bucket will fail.
 */

const CTA_NEEDS_URL = new Set(['LEARN_MORE', 'BOOK', 'ORDER', 'SHOP', 'SIGN_UP'])

export interface LocalPostInput {
  body: string
  ctaType: string | null
  ctaUrl: string | null
  mediaUrl: string | null
}

export async function createLocalPost(
  locationName: string,
  input: LocalPostInput,
  accessToken: string
): Promise<string> {
  const post: Record<string, unknown> = {
    languageCode: 'en-US',
    topicType: 'STANDARD',
    summary: input.body,
  }
  if (input.ctaType === 'CALL') {
    // CALL uses the business's listed phone number; no URL field.
    post.callToAction = { actionType: 'CALL' }
  } else if (input.ctaType && CTA_NEEDS_URL.has(input.ctaType) && input.ctaUrl) {
    post.callToAction = { actionType: input.ctaType, url: input.ctaUrl }
  }
  if (input.mediaUrl) {
    post.media = [{ mediaFormat: 'PHOTO', sourceUrl: input.mediaUrl }]
  }

  const res = await gbpFetch<{ name?: string }>(
    `https://mybusiness.googleapis.com/v4/${locationName}/localPosts`,
    accessToken,
    { method: 'POST', body: JSON.stringify(post) }
  )
  if (!res.ok || !res.data.name) {
    throw new Error(`GBP localPosts.create failed for ${locationName} (${res.status})`)
  }
  return res.data.name
}
