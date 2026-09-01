import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import {
  derivedPath,
  isHeic,
  MAX_RATIO,
  MAX_WIDTH,
  MIN_RATIO,
  paddingFor,
  renderForMeta,
  renderSharpForMeta,
} from '../social/media'

describe('paddingFor', () => {
  it('leaves legal ratios alone', () => {
    expect(paddingFor(1000, 1000)).toEqual({ width: 1000, height: 1000, left: 0, top: 0, right: 0, bottom: 0 })
    expect(paddingFor(800, 1000)).toEqual({ width: 800, height: 1000, left: 0, top: 0, right: 0, bottom: 0 })
    expect(paddingFor(1910, 1000)).toEqual({ width: 1910, height: 1000, left: 0, top: 0, right: 0, bottom: 0 })
  })
  it('pads a tall portrait out to 4:5 with equal side margins', () => {
    const p = paddingFor(1000, 2000)
    expect(p.width).toBe(1600)
    expect(p.height).toBe(2000)
    expect(p.left + p.right).toBe(600)
    expect(Math.abs(p.left - p.right)).toBeLessThanOrEqual(1)
    expect(p.top).toBe(0)
    expect(p.width / p.height).toBeGreaterThanOrEqual(MIN_RATIO)
  })
  it('pads a panorama down to 1.91:1 with top/bottom margins', () => {
    const p = paddingFor(3000, 1000)
    expect(p.width).toBe(3000)
    expect(p.height).toBe(Math.ceil(3000 / MAX_RATIO))
    expect(p.left).toBe(0)
    expect(p.top + p.bottom).toBe(p.height - 1000)
    expect(p.width / p.height).toBeLessThanOrEqual(MAX_RATIO)
  })
  it('with a target ratio, pads to exactly that ratio in either direction', () => {
    // Landscape photo forced to a portrait 4:5 first frame: side margins.
    const p = paddingFor(1600, 900, 0.8)
    expect(p.width).toBe(1600)
    expect(p.height).toBe(2000)
    expect(p.top + p.bottom).toBe(1100)
    // Portrait photo forced to a landscape first frame: top/bottom margins.
    const q = paddingFor(800, 1000, 1.5)
    expect(q.width).toBe(1500)
    expect(q.height).toBe(1000)
    expect(q.left + q.right).toBe(700)
    // Already at the target: nothing.
    expect(paddingFor(1000, 1250, 0.8)).toEqual({ width: 1000, height: 1250, left: 0, top: 0, right: 0, bottom: 0 })
  })
})

describe('derivedPath', () => {
  it('is stable, under the org folder, and a jpg', () => {
    const a = derivedPath('org-1/captures/job/1.heic')
    expect(a).toBe(derivedPath('org-1/captures/job/1.heic'))
    expect(a).toMatch(/^org-1\/derived\/[0-9a-f]{40}\.jpg$/)
    expect(derivedPath('org-1/captures/job/2.heic')).not.toBe(a)
  })
  it('a forced carousel ratio gets its own derived object', () => {
    const free = derivedPath('org-1/captures/job/1.heic')
    const forced = derivedPath('org-1/captures/job/1.heic', 0.8)
    expect(forced).not.toBe(free)
    expect(forced).toBe(derivedPath('org-1/captures/job/1.heic', 0.8))
  })
})

describe('isHeic', () => {
  it('trusts the content type, else sniffs the ftyp brand', () => {
    expect(isHeic('image/heic')).toBe(true)
    expect(isHeic('image/jpeg')).toBe(false)
    const bytes = new Uint8Array(16)
    bytes.set([0x66, 0x74, 0x79, 0x70], 4) // 'ftyp'
    bytes.set([0x68, 0x65, 0x69, 0x63], 8) // 'heic'
    expect(isHeic('application/octet-stream', bytes)).toBe(true)
  })
})

describe('renderForMeta', () => {
  it('converts PNG with alpha to a padded, white-backed JPEG inside the ratio window', async () => {
    const png = await sharp({
      create: { width: 200, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer()
    const out = await renderForMeta(png, 'image/png')
    const meta = await sharp(out.buffer).metadata()
    expect(meta.format).toBe('jpeg')
    expect(out.width).toBe(480)
    expect(out.height).toBe(600)
    expect(meta.width).toBe(480)
    // Transparent source flattened to white: the corner pixel is white.
    const { data } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true })
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255])
  })

  it('caps width at MAX_WIDTH without enlarging small images', async () => {
    const wide = await sharp({ create: { width: 4000, height: 2500, channels: 3, background: '#123456' } })
      .jpeg()
      .toBuffer()
    const out = await renderForMeta(wide, 'image/jpeg')
    expect(out.width).toBe(MAX_WIDTH)
    expect(out.height).toBe(900)

    // A 2:1 panorama is resized first, then padded down to 1.91:1.
    const pano = await sharp({ create: { width: 4000, height: 2000, channels: 3, background: '#123456' } })
      .jpeg()
      .toBuffer()
    const outPano = await renderForMeta(pano, 'image/jpeg')
    expect(outPano.width).toBe(MAX_WIDTH)
    expect(outPano.height).toBe(Math.ceil(MAX_WIDTH / MAX_RATIO))

    const small = await sharp({ create: { width: 300, height: 300, channels: 3, background: '#123456' } })
      .jpeg()
      .toBuffer()
    const outSmall = await renderForMeta(small, 'image/jpeg')
    expect(outSmall.width).toBe(300)
  })

  it('bakes EXIF orientation into the pixels', async () => {
    // 100x50 landscape tagged Orientation=6 (rotate 90° CW) renders as 50x100 portrait.
    const tagged = await sharp({ create: { width: 100, height: 50, channels: 3, background: '#abcdef' } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const out = await renderForMeta(tagged, 'image/jpeg')
    const meta = await sharp(out.buffer).metadata()
    expect(meta.width).toBe(out.width)
    expect(out.height).toBe(100)
    expect(out.width).toBe(80) // 50 wide padded up to 4:5 of 100 tall
    expect(meta.orientation).toBeUndefined()
  })

  it('renders a RAW-input pipeline (the HEIC path) without re-feeding raw pixels as an encoded image', async () => {
    // heic-decode hands us RGBA pixels; the pipeline must survive that shape.
    const width = 300
    const height = 3000 // 1:10 portrait, needs padding
    const rgba = Buffer.alloc(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = 10
      rgba[i * 4 + 1] = 20
      rgba[i * 4 + 2] = 30
      rgba[i * 4 + 3] = 255
    }
    const base = sharp(rgba, { raw: { width, height, channels: 4 } })
    const out = await renderSharpForMeta(base)
    const meta = await sharp(out.buffer).metadata()
    expect(meta.format).toBe('jpeg')
    expect(out.height).toBe(height)
    expect(out.width).toBe(Math.ceil(height * MIN_RATIO))
    expect(meta.width).toBe(out.width)
    // Left margin is white, the centre pixel is the source colour.
    const { data, info } = await sharp(out.buffer).raw().toBuffer({ resolveWithObject: true })
    const px = (x: number, y: number) => {
      const o = (y * info.width + x) * info.channels
      return [data[o], data[o + 1], data[o + 2]]
    }
    expect(px(0, 0)).toEqual([255, 255, 255])
    const [r, g, b] = px(Math.floor(info.width / 2), Math.floor(info.height / 2))
    expect(Math.abs(r - 10)).toBeLessThan(6)
    expect(Math.abs(g - 20)).toBeLessThan(6)
    expect(Math.abs(b - 30)).toBeLessThan(6)
  })

  it('pads to a forced target ratio for carousel items', async () => {
    const landscape = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#123456' } })
      .jpeg()
      .toBuffer()
    const out = await renderForMeta(landscape, 'image/jpeg', 0.8)
    expect(out.width).toBe(1200)
    expect(out.height).toBe(1500)
    const meta = await sharp(out.buffer).metadata()
    expect(meta.width).toBe(1200)
    expect(meta.height).toBe(1500)
  })
})
