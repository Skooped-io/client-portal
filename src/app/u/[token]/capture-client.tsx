'use client'

import { useCallback, useRef, useState } from 'react'
import {
  Camera,
  CheckCircle2,
  CloudUpload,
  Film,
  ImageIcon,
  Loader2,
  RotateCcw,
  X,
} from 'lucide-react'
import {
  ALLOWED_TYPES,
  MAX_FILES_PER_REQUEST,
  maxBytesFor,
  isVideo,
} from '@/lib/capture/validate'

interface CaptureClientProps {
  token: string
  orgName: string
}

interface Item {
  id: string
  file: File
  preview: string | null
  status: 'ready' | 'uploading' | 'done' | 'error'
  loaded: number
  path?: string
  error?: string
}

type Phase = 'pick' | 'uploading' | 'done'

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}

function putFile(
  url: string,
  file: File,
  onProgress: (loaded: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`))
    xhr.onerror = () => reject(new Error('Network error. Check your signal and try again'))
    xhr.send(file)
  })
}

export function CaptureClient({ token, orgName }: CaptureClientProps) {
  const [items, setItems] = useState<Item[]>([])
  const [job, setJob] = useState('')
  const [phase, setPhase] = useState<Phase>('pick')
  const [notice, setNotice] = useState<string | null>(null)
  const [sentCount, setSentCount] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const idRef = useRef(0)

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return
    setNotice(null)
    const rejected: string[] = []
    const additions: Item[] = []

    for (const file of Array.from(list)) {
      if (!(file.type in ALLOWED_TYPES)) {
        rejected.push(`${file.name || 'A file'} is not a supported photo or video`)
        continue
      }
      if (file.size > maxBytesFor(file.type)) {
        const mb = Math.round(maxBytesFor(file.type) / 1024 / 1024)
        rejected.push(`${file.name || 'A file'} is over the ${mb}MB limit`)
        continue
      }
      idRef.current += 1
      additions.push({
        id: `f${idRef.current}`,
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
        status: 'ready',
        loaded: 0,
      })
    }

    setItems((prev) => {
      const merged = [...prev, ...additions]
      if (merged.length > MAX_FILES_PER_REQUEST) {
        rejected.push(`Maximum ${MAX_FILES_PER_REQUEST} files per send. Extra files were skipped`)
      }
      return merged.slice(0, MAX_FILES_PER_REQUEST)
    })
    if (rejected.length > 0) setNotice(rejected.join('. '))
  }, [])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id)
      if (target?.preview) URL.revokeObjectURL(target.preview)
      return prev.filter((i) => i.id !== id)
    })
  }, [])

  const updateItem = useCallback((id: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)))
  }, [])

  const upload = useCallback(async () => {
    const pending = items.filter((i) => i.status === 'ready' || i.status === 'error')
    if (pending.length === 0) return
    setNotice(null)
    setPhase('uploading')
    pending.forEach((i) => updateItem(i.id, { status: 'uploading', loaded: 0, error: undefined }))

    let signed: { job: string; uploads: Array<{ path: string; signedUrl: string }> }
    try {
      const res = await fetch('/api/capture/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          job,
          files: pending.map((i) => ({ type: i.file.type, size: i.file.size })),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.uploads || data.uploads.length !== pending.length) {
        throw new Error(data?.error ?? 'Could not start the upload. Try again')
      }
      signed = data
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not start the upload. Try again'
      pending.forEach((i) => updateItem(i.id, { status: 'error', error: msg }))
      setNotice(msg)
      setPhase('pick')
      return
    }

    const landed: string[] = []
    for (const [index, item] of pending.entries()) {
      const { path, signedUrl } = signed.uploads[index]
      try {
        await putFile(signedUrl, item.file, (loaded) => updateItem(item.id, { loaded }))
        updateItem(item.id, { status: 'done', loaded: item.file.size, path })
        landed.push(path)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed'
        updateItem(item.id, { status: 'error', error: msg })
      }
    }

    if (landed.length > 0) {
      fetch('/api/capture/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, paths: landed }),
      }).catch(() => {})
    }

    if (landed.length === pending.length) {
      setSentCount((prev) => prev + landed.length)
      items.forEach((i) => {
        if (i.preview) URL.revokeObjectURL(i.preview)
      })
      setItems([])
      setPhase('done')
    } else {
      setNotice(
        `${pending.length - landed.length} file${pending.length - landed.length === 1 ? '' : 's'} did not go through. Tap Send again to retry the failed ones`
      )
      setPhase('pick')
      if (landed.length > 0) setSentCount((prev) => prev + landed.length)
      setItems((prev) => prev.filter((i) => i.status !== 'done'))
    }
  }, [items, job, token, updateItem])

  const totalBytes = items.reduce((sum, i) => sum + i.file.size, 0)
  const loadedBytes = items.reduce((sum, i) => sum + i.loaded, 0)
  const overallPct = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0
  const uploading = phase === 'uploading'

  if (phase === 'done') {
    return (
      <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 text-center">
        <CheckCircle2 className="h-20 w-20 text-green-500" strokeWidth={1.5} />
        <h1 className="mt-6 text-2xl font-bold text-slate-900">Sent to Skooped</h1>
        <p className="mt-2 text-slate-600">
          {sentCount} file{sentCount === 1 ? '' : 's'} received for {orgName}. Nice work.
        </p>
        <button
          onClick={() => {
            setPhase('pick')
            setSentCount(0)
            setNotice(null)
          }}
          className="mt-8 w-full max-w-sm rounded-2xl bg-slate-900 px-6 py-4 text-lg font-semibold text-white active:scale-[0.98]"
        >
          Send more
        </button>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 pb-28 pt-8">
      <div className="mx-auto w-full max-w-md">
        <header className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900">
            <Camera className="h-7 w-7 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">{orgName}</h1>
          <p className="mt-1 text-slate-600">Send job photos and video to Skooped</p>
          <p className="mt-3 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            3 photos and a 10 second clip: at tear-out, mid-build, and finished.
          </p>
        </header>

        <label className="mt-6 block">
          <span className="text-sm font-medium text-slate-700">Job (optional)</span>
          <input
            type="text"
            value={job}
            onChange={(e) => setJob(e.target.value)}
            placeholder="Street or customer name"
            maxLength={60}
            disabled={uploading}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none"
          />
        </label>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />

        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading || items.length >= MAX_FILES_PER_REQUEST}
          className="mt-4 flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white px-6 py-8 text-lg font-semibold text-slate-700 active:scale-[0.98] disabled:opacity-50"
        >
          <ImageIcon className="h-6 w-6" />
          {items.length === 0 ? 'Add photos and videos' : 'Add more'}
        </button>

        {notice && (
          <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</p>
        )}

        {items.length > 0 && (
          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2"
              >
                {item.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.preview}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg object-cover bg-slate-100"
                    onError={(e) => {
                      // HEIC previews don't render on every browser; fall back to an icon
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                    <Film className="h-6 w-6 text-slate-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {item.file.name || (isVideo(item.file.type) ? 'Video' : 'Photo')}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatBytes(item.file.size)}
                    {item.status === 'error' && (
                      <span className="ml-2 text-red-600">{item.error}</span>
                    )}
                  </p>
                  {item.status === 'uploading' && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-900 transition-all"
                        style={{
                          width: `${Math.min(100, Math.round((item.loaded / Math.max(1, item.file.size)) * 100))}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                {item.status === 'done' ? (
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-green-500" />
                ) : item.status === 'uploading' ? (
                  <Loader2 className="h-6 w-6 shrink-0 animate-spin text-slate-400" />
                ) : item.status === 'error' ? (
                  <RotateCcw className="h-6 w-6 shrink-0 text-amber-500" />
                ) : (
                  <button
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-400 active:bg-slate-100"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">
          Uploads go straight to Skooped for {orgName}. Questions? Text Joseph: 615-315-1541
        </p>
      </div>

      {items.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          <button
            onClick={upload}
            disabled={uploading}
            className="mx-auto flex w-full max-w-md items-center justify-center gap-3 rounded-2xl bg-slate-900 px-6 py-4 text-lg font-semibold text-white active:scale-[0.98] disabled:opacity-70"
          >
            {uploading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Sending {overallPct}%
              </>
            ) : (
              <>
                <CloudUpload className="h-5 w-5" />
                Send {items.length} file{items.length === 1 ? '' : 's'}
              </>
            )}
          </button>
        </div>
      )}
    </main>
  )
}
