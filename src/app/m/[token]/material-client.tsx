'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, Film, Loader2 } from 'lucide-react'

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
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function MaterialClient({ token, orgName, files: initial }: MaterialClientProps) {
  const [files, setFiles] = useState(initial)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [postRef, setPostRef] = useState('')
  const [busy, setBusy] = useState(false)
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

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-32 pt-8">
      <div className="mx-auto w-full max-w-2xl">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">{orgName} material</h1>
          <p className="mt-1 text-slate-600">
            {availableCount} of {files.length} file{files.length === 1 ? '' : 's'} available to post.
            Tap to select, then mark below. Long-press a photo to save it.
          </p>
        </header>

        {notice && (
          <p className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{notice}</p>
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
            <input
              type="text"
              value={postRef}
              onChange={(e) => setPostRef(e.target.value)}
              placeholder="Where posted? e.g. fb, gbp, ig (optional)"
              maxLength={120}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => mark(true)}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white active:scale-[0.98] disabled:opacity-70"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Mark {selected.size} posted
              </button>
              <button
                onClick={() => mark(false)}
                disabled={busy}
                className="rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700 active:scale-[0.98] disabled:opacity-70"
              >
                Unmark
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
