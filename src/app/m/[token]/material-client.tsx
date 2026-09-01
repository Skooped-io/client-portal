'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Circle, Film, Loader2 } from 'lucide-react'
import {
  allowedActions,
  CAPTION_LIMITS,
  countHashtags,
  countMentions,
  IG_MAX_HASHTAGS,
  IG_MAX_MENTIONS,
  MAX_ATTEMPTS,
  scheduleMode,
  type Platform,
  type SocialPost,
} from '@/lib/social/queue'

export interface MaterialFile {
  path: string
  url: string
  job: string
  location: string | null
  notes: string | null
  contentType: string
  sizeBytes: number
  postedAt: string | null
  postRef: string | null
  createdAt: string
}

interface MaterialClientProps {
  token: string
  orgName: string
  files: MaterialFile[]
  posts: SocialPost[]
  /** Public bucket prefix; media paths append to it. */
  mediaBase: string
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatWhen(iso: string | null): string {
  if (!iso) return 'now'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Date → value for <input type="datetime-local"> in the browser's zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local value (browser zone) → ISO with Z, which the API requires. */
function fromLocalInput(value: string): string | null {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

function postRefOf(post: SocialPost): string | null {
  if (!post.platform_post_id) return null
  return `${post.platform === 'facebook' ? 'fb' : 'ig'}:${post.platform_post_id}`
}

const PLATFORM_LABEL: Record<Platform, string> = { facebook: 'Facebook', instagram: 'Instagram' }
const PLATFORM_BADGE: Record<Platform, string> = {
  facebook: 'bg-blue-600 text-white',
  instagram: 'bg-pink-600 text-white',
}
const STATUS_BADGE: Record<SocialPost['status'], string> = {
  draft: 'bg-slate-200 text-slate-800',
  approved: 'bg-sky-100 text-sky-800',
  scheduled: 'bg-indigo-100 text-indigo-800',
  publishing: 'bg-amber-100 text-amber-800',
  published: 'bg-green-600 text-white',
  failed: 'bg-red-600 text-white',
  cancelled: 'bg-slate-100 text-slate-500',
}

function statusLabel(post: SocialPost, now: Date): string {
  switch (post.status) {
    case 'draft':
      return 'Draft'
    case 'approved': {
      const due = !post.scheduled_at || Date.parse(post.scheduled_at) <= now.getTime()
      if (due) return post.last_error ? 'Approved · retrying' : 'Approved · due now'
      return `Approved · posts ${formatWhen(post.scheduled_at)}`
    }
    case 'scheduled':
      return `Scheduled on Facebook · ${formatWhen(post.scheduled_at)}`
    case 'publishing':
      return 'Publishing…'
    case 'published':
      return `Published ${post.published_at ? formatWhen(post.published_at) : ''}`.trim()
    case 'failed':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
  }
}

interface QueueCardProps {
  post: SocialPost
  mediaBase: string
  busy: boolean
  onAction: (
    post: SocialPost,
    action: 'update' | 'approve' | 'unapprove' | 'delete',
    extra?: { caption?: string; scheduled_at?: string | null }
  ) => Promise<void>
}

function Thumbs({ post, mediaBase, size = 'h-16 w-16' }: { post: SocialPost; mediaBase: string; size?: string }) {
  return (
    <ul className="mt-2 flex gap-1.5 overflow-x-auto">
      {post.media.slice(0, 6).map((m) => (
        <li key={m.path} className={`${size} flex-none overflow-hidden rounded-lg bg-slate-200`}>
          {m.content_type.startsWith('video/') ? (
            <div className="flex h-full w-full items-center justify-center">
              <Film className="h-6 w-6 text-slate-500" />
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaBase + m.path} alt="" loading="lazy" className="h-full w-full object-cover" />
          )}
        </li>
      ))}
      {post.media.length > 6 && (
        <li className={`${size} flex flex-none items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-600`}>
          +{post.media.length - 6}
        </li>
      )}
    </ul>
  )
}

function QueueCard({ post, mediaBase, busy, onAction }: QueueCardProps) {
  const [caption, setCaption] = useState(post.caption ?? '')
  const [when, setWhen] = useState(toLocalInput(post.scheduled_at))
  const [now, setNow] = useState(() => new Date())

  // A server response replaces the row; re-seed the editors from it.
  useEffect(() => {
    setCaption(post.caption ?? '')
    setWhen(toLocalInput(post.scheduled_at))
  }, [post.updated_at, post.caption, post.scheduled_at])

  // Keep "posts now" honest while the card sits open.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const can = allowedActions(post)
  const limit = CAPTION_LIMITS[post.platform]
  const hashtags = post.platform === 'instagram' ? countHashtags(caption) : 0
  const mentions = post.platform === 'instagram' ? countMentions(caption) : 0
  const overLimit = caption.length > limit || hashtags > IG_MAX_HASHTAGS || mentions > IG_MAX_MENTIONS
  const dirty = caption !== (post.caption ?? '') || when !== toLocalInput(post.scheduled_at)
  const editable = can.edit && !busy

  // Same rule the server applies: blank, past, or under 2 minutes out posts
  // the moment Approve is tapped.
  const whenIso = fromLocalInput(when)
  const mode = scheduleMode(whenIso ? new Date(whenIso) : null, now, post.platform)
  const postsNow = mode === 'publish-now'

  const extra = () => ({ caption, scheduled_at: whenIso })

  const approve = () => {
    if (postsNow && !window.confirm(`Post this to ${PLATFORM_LABEL[post.platform]} right now?`)) return
    void onAction(post, 'approve', extra())
  }

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${PLATFORM_BADGE[post.platform]}`}>
          {PLATFORM_LABEL[post.platform]}
        </span>
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[post.status]}`}>
          {statusLabel(post, now)}
        </span>
        <span className="ml-auto text-[11px] text-slate-400">
          {post.post_type === 'carousel' ? `${post.media.length} photos` : post.post_type}
        </span>
      </div>

      <Thumbs post={post} mediaBase={mediaBase} />

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        disabled={!editable}
        rows={4}
        placeholder={`Caption for ${PLATFORM_LABEL[post.platform]}…`}
        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none disabled:bg-slate-50 disabled:text-slate-600"
      />
      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-[11px]">
        <span className={caption.length > limit ? 'font-semibold text-red-600' : 'text-slate-500'}>
          {caption.length.toLocaleString('en-US')} / {limit.toLocaleString('en-US')}
        </span>
        {post.platform === 'instagram' && (
          <span className={hashtags > IG_MAX_HASHTAGS ? 'font-semibold text-red-600' : 'text-slate-500'}>
            {hashtags} / {IG_MAX_HASHTAGS} hashtags
          </span>
        )}
        {post.platform === 'instagram' && mentions > 0 && (
          <span className={mentions > IG_MAX_MENTIONS ? 'font-semibold text-red-600' : 'text-slate-500'}>
            {mentions} / {IG_MAX_MENTIONS} @mentions
          </span>
        )}
      </div>

      <label className="mt-2 block text-[11px] font-medium text-slate-500">
        Post at
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          disabled={!editable}
          className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus:border-slate-900 focus:outline-none disabled:bg-slate-50 disabled:text-slate-600"
        />
        {can.approve && (
          <span className={`mt-1 block font-normal ${postsNow ? 'text-amber-700' : 'text-slate-400'}`}>
            {postsNow
              ? 'Blank or past time: Approve posts it immediately.'
              : mode === 'fb-native'
                ? 'Meta will hold it and publish at this time.'
                : 'Our publisher posts it at this time (checks every 5 minutes).'}
          </span>
        )}
      </label>

      {post.last_error && (post.status === 'failed' || post.status === 'approved' || post.status === 'scheduled') && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            post.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'
          }`}
        >
          {post.status === 'failed'
            ? post.last_error
            : `Last attempt failed (${post.attempts}/${MAX_ATTEMPTS}): ${post.last_error} — retrying`}
        </p>
      )}
      {post.status === 'scheduled' && (
        <p className="mt-2 text-xs text-slate-500">
          Meta is holding this post. It also shows in Business Suite Planner; Unapprove removes it there.
        </p>
      )}
      {post.status === 'approved' && (
        <p className="mt-2 text-xs text-slate-500">
          {post.platform === 'instagram'
            ? 'Instagram has no scheduling API, so our publisher posts it at that time. Unapprove to stop it.'
            : 'Outside the window Meta can hold it, so our publisher posts it at that time. Unapprove to stop it.'}
        </p>
      )}
      {post.status === 'publishing' && (
        <p className="mt-2 text-xs text-slate-500">
          Sending to Meta. If this sits here for more than 15 minutes it will come back as Failed with a Retry button.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {can.approve && (
          <button
            onClick={approve}
            disabled={busy || overLimit || caption.trim().length === 0}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50 ${
              postsNow ? 'bg-amber-600' : 'bg-slate-900'
            }`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {post.status === 'failed' ? (postsNow ? 'Retry & post now' : 'Retry') : postsNow ? 'Approve & post now' : 'Approve'}
          </button>
        )}
        {can.edit && dirty && (
          <button
            onClick={() => onAction(post, 'update', extra())}
            disabled={busy || overLimit}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 active:scale-[0.98] disabled:opacity-50"
          >
            Save
          </button>
        )}
        {can.unapprove && (
          <button
            onClick={() => onAction(post, 'unapprove')}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 active:scale-[0.98] disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Unapprove
          </button>
        )}
        {can.delete && (
          <button
            onClick={() => {
              if (window.confirm('Delete this post from the queue?')) onAction(post, 'delete')
            }}
            disabled={busy}
            className="rounded-xl px-3 py-2.5 text-sm font-semibold text-red-600 active:scale-[0.98] disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </div>
    </li>
  )
}

/** Compact row for a post that already went live: badge, thumbnails, date. */
function PostedCard({ post, mediaBase }: { post: SocialPost; mediaBase: string }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${PLATFORM_BADGE[post.platform]}`}>
          {PLATFORM_LABEL[post.platform]}
        </span>
        <span className="text-[11px] text-slate-500">
          {post.published_at ? formatWhen(post.published_at) : 'Published'}
        </span>
        <span className="ml-auto text-[11px] text-slate-400">
          {post.post_type === 'carousel' ? `${post.media.length} photos` : post.post_type}
        </span>
      </div>
      <Thumbs post={post} mediaBase={mediaBase} size="h-10 w-10" />
    </li>
  )
}

export function MaterialClient({ token, orgName, files: initial, posts: initialPosts, mediaBase }: MaterialClientProps) {
  const [files, setFiles] = useState(initial)
  const [posts, setPosts] = useState(initialPosts)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [postRef, setPostRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [busyPost, setBusyPost] = useState<string | null>(null)
  const [choosingPlatform, setChoosingPlatform] = useState(false)
  const [showPosted, setShowPosted] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const jobs = useMemo(() => {
    const map = new Map<string, MaterialFile[]>()
    for (const f of files) {
      const list = map.get(f.job) ?? []
      list.push(f)
      map.set(f.job, list)
    }
    return Array.from(map.entries())
  }, [files])

  const availableCount = files.filter((f) => !f.postedAt).length
  // Drafts and in-flight rows need Joseph; published history is folded away.
  const queuePosts = posts.filter((p) => p.status !== 'cancelled' && p.status !== 'published')
  const postedPosts = posts.filter((p) => p.status === 'published')

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const mark = async (posted: boolean) => {
    if (selected.size === 0 || busy) return
    setBusy(true)
    setNotice(null)
    try {
      const res = await fetch('/api/material/mark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          paths: Array.from(selected),
          posted,
          post_ref: postRef || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Update failed. Try again')
      const now = new Date().toISOString()
      setFiles((prev) =>
        prev.map((f) =>
          selected.has(f.path)
            ? { ...f, postedAt: posted ? now : null, postRef: posted ? postRef || f.postRef : null }
            : f
        )
      )
      setSelected(new Set())
      setPostRef('')
      setNotice(`${data.updated} file${data.updated === 1 ? '' : 's'} marked ${posted ? 'posted' : 'available'}`)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Update failed. Try again')
    } finally {
      setBusy(false)
    }
  }

  const queue = async (platforms: Platform[]) => {
    if (selected.size === 0 || busy) return
    setBusy(true)
    setNotice(null)
    try {
      // Keep the on-screen order (job groups, newest first) as the carousel order.
      const paths = files.filter((f) => selected.has(f.path)).map((f) => f.path)
      const res = await fetch('/api/material/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, paths, platforms }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Could not queue. Try again')
      const created = (data?.posts ?? []) as SocialPost[]
      setPosts((prev) => [...created, ...prev])
      setSelected(new Set())
      setChoosingPlatform(false)
      setNotice(`${created.length} draft${created.length === 1 ? '' : 's'} queued. Edit the caption above and approve.`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Could not queue. Try again')
    } finally {
      setBusy(false)
    }
  }

  const act: QueueCardProps['onAction'] = async (post, action, extra) => {
    if (busyPost) return
    setBusyPost(post.id)
    setNotice(null)
    try {
      const res = await fetch('/api/material/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, id: post.id, action, ...extra }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? 'Update failed. Try again')
      const updated = data?.post as SocialPost | null
      if (updated) {
        setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        if (updated.status === 'published') {
          const paths = new Set(updated.media.map((m) => m.path))
          const ref = postRefOf(updated)
          setFiles((prev) =>
            prev.map((f) =>
              paths.has(f.path)
                ? {
                    ...f,
                    postedAt: updated.published_at,
                    postRef: ref ? [f.postRef, ref].filter(Boolean).join(' ') : f.postRef,
                  }
                : f
            )
          )
        }
        if (updated.status === 'cancelled') setPosts((prev) => prev.filter((p) => p.id !== updated.id))
        if (action === 'approve' && updated.status === 'failed') {
          setNotice(updated.last_error ?? 'Meta rejected the post')
        }
        if (action === 'approve' && updated.status === 'approved' && updated.last_error) {
          setNotice(`${updated.last_error}. Our publisher will finish it within a few minutes.`)
        }
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Update failed. Try again')
    } finally {
      setBusyPost(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-48 pt-8">
      <div className="mx-auto w-full max-w-2xl">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">{orgName} material</h1>
          <p className="mt-1 text-slate-600">
            {availableCount} of {files.length} file{files.length === 1 ? '' : 's'} available to post.
            Tap to select, then queue or mark below. Long-press a photo to save it.
          </p>
        </header>

        {notice && (
          <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{notice}</p>
        )}

        {queuePosts.length > 0 && (
          <section className="mt-6">
            <h2 className="text-base font-semibold text-slate-800">Needs your OK</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Nothing posts until you approve it here.
            </p>
            <ul className="mt-3 flex flex-col gap-3">
              {queuePosts.map((p) => (
                <QueueCard
                  key={p.id}
                  post={p}
                  mediaBase={mediaBase}
                  busy={busyPost === p.id}
                  onAction={act}
                />
              ))}
            </ul>
          </section>
        )}

        {postedPosts.length > 0 && (
          <section className="mt-6">
            <button
              onClick={() => setShowPosted((v) => !v)}
              className="text-base font-semibold text-slate-800"
              aria-expanded={showPosted}
            >
              Posted ({postedPosts.length}) {showPosted ? '▾' : '▸'}
            </button>
            {showPosted && (
              <ul className="mt-3 flex flex-col gap-2">
                {postedPosts.map((p) => (
                  <PostedCard key={p.id} post={p} mediaBase={mediaBase} />
                ))}
              </ul>
            )}
          </section>
        )}

        {jobs.map(([job, jobFiles]) => (
          <section key={job} className="mt-8">
            <h2 className="text-base font-semibold text-slate-800">{job}</h2>
            {(jobFiles[0].location || jobFiles[0].notes) && (
              <p className="mt-0.5 text-sm text-slate-500">
                {[jobFiles[0].location, jobFiles[0].notes].filter(Boolean).join(' · ')}
              </p>
            )}
            <ul className="mt-3 grid grid-cols-3 gap-2">
              {jobFiles.map((f) => {
                const isSelected = selected.has(f.path)
                const isVideo = f.contentType.startsWith('video/')
                return (
                  <li key={f.path} className="relative">
                    <button
                      onClick={() => toggle(f.path)}
                      className={`block w-full overflow-hidden rounded-xl border-2 ${
                        isSelected ? 'border-slate-900' : 'border-transparent'
                      }`}
                    >
                      {isVideo ? (
                        <div className="flex aspect-square items-center justify-center bg-slate-200">
                          <Film className="h-8 w-8 text-slate-500" />
                        </div>
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={f.url}
                          alt=""
                          loading="lazy"
                          className="aspect-square w-full bg-slate-200 object-cover"
                        />
                      )}
                    </button>
                    <span className="pointer-events-none absolute left-1.5 top-1.5">
                      {isSelected ? (
                        <CheckCircle2 className="h-5 w-5 rounded-full bg-white text-slate-900" />
                      ) : (
                        <Circle className="h-5 w-5 rounded-full bg-white/70 text-slate-400" />
                      )}
                    </span>
                    <span
                      className={`pointer-events-none absolute bottom-1.5 left-1.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        f.postedAt ? 'bg-green-600 text-white' : 'bg-amber-400 text-slate-900'
                      }`}
                    >
                      {f.postedAt ? `posted ${formatDate(f.postedAt)}` : 'available'}
                    </span>
                    {isVideo && (
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute bottom-1.5 right-1.5 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                      >
                        open
                      </a>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        {files.length === 0 && (
          <p className="mt-10 text-center text-slate-500">
            Nothing uploaded yet. Files the crew sends via the upload link land here.
          </p>
        )}
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-2">
            {choosingPlatform ? (
              <>
                <p className="text-sm font-medium text-slate-700">
                  Queue {selected.size} file{selected.size === 1 ? '' : 's'} as a draft for:
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => queue(['facebook'])}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-blue-600 px-3 py-3 font-semibold text-white active:scale-[0.98] disabled:opacity-70"
                  >
                    Facebook
                  </button>
                  <button
                    onClick={() => queue(['instagram'])}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-pink-600 px-3 py-3 font-semibold text-white active:scale-[0.98] disabled:opacity-70"
                  >
                    Instagram
                  </button>
                  <button
                    onClick={() => queue(['facebook', 'instagram'])}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-3 font-semibold text-white active:scale-[0.98] disabled:opacity-70"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Both
                  </button>
                </div>
                <button
                  onClick={() => setChoosingPlatform(false)}
                  disabled={busy}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 active:scale-[0.98] disabled:opacity-70"
                >
                  Back
                </button>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={postRef}
                  onChange={(e) => setPostRef(e.target.value)}
                  placeholder="Where posted? e.g. fb, gbp, ig (optional)"
                  maxLength={120}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
                />
                <button
                  onClick={() => setChoosingPlatform(true)}
                  disabled={busy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white active:scale-[0.98] disabled:opacity-70"
                >
                  Queue {selected.size} for posting
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => mark(true)}
                    disabled={busy}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 active:scale-[0.98] disabled:opacity-70"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    Mark posted
                  </button>
                  <button
                    onClick={() => mark(false)}
                    disabled={busy}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 active:scale-[0.98] disabled:opacity-70"
                  >
                    Unmark
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
