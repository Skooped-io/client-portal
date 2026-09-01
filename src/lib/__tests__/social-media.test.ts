import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { derivedPath, isHeic, MAX_RATIO, MAX_WIDTH, MIN_RATIO, paddingFor, renderForMeta } from '../social/media'

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
})

describe('derivedPath', () => {
  it('is stable, under the org folder, and a jpg', () => {
    const a = derivedPath('org-1/captures/job/1.heic')
    expect(a).toBe(derivedPath('org-1/captures/job/1.heic'))
    expect(a).toMatch(/^org-1\/derived\/[0-9a-f]{40}\.jpg$/)
    expect(derivedPath('org-1/captures/job/2.heic')).not.toBe(a)
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
})
