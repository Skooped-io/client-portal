import { gbpFetch } from './client'

/**
 * v4 review endpoints (mybusiness.googleapis.com) — Google kept reviews on v4
 * while moving other features to v1. Paths are account-scoped:
 * accounts/{a}/locations/{l}/reviews.
 */

// Real v4 enum is ONE..FIVE (the old scaffold's STAR_ONE..STAR_FIVE decoded
// everything to undefined — bug caught in the 2026-07 port, do not regress).
const STAR_RATING: Record<string, number> = {
  STAR_RATING_UNSPECIFIED: 0,
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
}

export interface GbpReview {
  /** Full resource name: accounts/{a}/locations/{l}/reviews/{r} */
  name: string
  reviewId: string
  reviewer?: { displayName?: string; isAnonymous?: boolean }
  starRating?: string
  comment?: string
  createTime?: string
  updateTime?: string
  reviewReply?: { comment: string; updateTime: string }
}

export function starValue(review: GbpReview): number {
  return STAR_RATING[review.starRating ?? ''] ?? 0
}

export async function listAllReviews(
  locationName: string,
  accessToken: string
): Promise<GbpReview[]> {
  const reviews: GbpReview[] = []
  let pageToken: string | undefined
  do {
    const params = new URLSearchParams({ pageSize: '50' })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await gbpFetch<{
      reviews?: GbpReview[]
      nextPageToken?: string
    }>(`https://mybusiness.googleapis.com/v4/${locationName}/reviews?${params}`, accessToken)
    if (!res.ok) {
      throw new Error(`GBP reviews.list failed for ${locationName} (${res.status})`)
    }
    // v4 review objects carry the resource name in `name`; older payloads only
    // carry reviewId — synthesize the name so the unique key is always stable.
    for (const r of res.data.reviews ?? []) {
      reviews.push({ ...r, name: r.name ?? `${locationName}/reviews/${r.reviewId}` })
    }
    pageToken = res.data.nextPageToken
  } while (pageToken)
  return reviews
}

/**
 * Create or update the owner reply on a review. PUT is create-or-replace on
 * v4 — the caller is responsible for the never-touch-locked-reviews rule
 * (enforced in the cron via classification, not here).
 */
export async function updateReply(
  reviewName: string,
  comment: string,
  accessToken: string
): Promise<void> {
  const res = await gbpFetch<unknown>(
    `https://mybusiness.googleapis.com/v4/${reviewName}/reply`,
    accessToken,
    { method: 'PUT', body: JSON.stringify({ comment }) }
  )
  if (!res.ok) {
    throw new Error(`GBP updateReply failed for ${reviewName} (${res.status})`)
  }
}
