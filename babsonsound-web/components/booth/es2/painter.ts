// The booth panel is 960 x 540 (shown doubled on the 1920 x 1080 studio screen). Faceplates and sprites are bitmaps at that size.
// Live text, icons and knob arcs are laid out by the DOM (kept invisible) and painted here into 960 x 540 canvases, one per
// stacking layer, so every pixel on the panel is a real low-res pixel whatever the window size or display density.

interface Scale { n: number; crisp: boolean; dpr: number }
type Ctx = CanvasRenderingContext2D

const ICONS = new Map<string, HTMLCanvasElement | null>()
let ASC: Record<string, [number, number]> = {}
const CLIP = new WeakMap<Element, Element[]>()

/** Mount the painter on a stage. Returns the cleanup. */
export function mountStage(stage: HTMLElement, fitEl: HTMLElement, mx: HTMLElement): () => void {
  let sc: Scale = { n: 0, crisp: false, dpr: 1 }
  let raf = 0, mxTimer = 0, dead = false

  const paint = () => {
    if (raf || dead) return
    raf = requestAnimationFrame(() => {
      raf = 0
      stage.querySelectorAll<HTMLCanvasElement>('canvas.txl').forEach(c => drawLayer(c, stage, paint))
    })
  }
  const matrix = () => { clearTimeout(mxTimer); mxTimer = window.setTimeout(() => drawMatrix(stage, mx, sc), 40) }

  // Near a whole multiple (the studio screen is exactly 2x) the stage snaps to it and pixels are hard-edged; otherwise it scales smoothly.
  const fit = () => {
    const dpr = window.devicePixelRatio || 1
    let s = Math.min(window.innerWidth / 960, window.innerHeight / 540)
    const px = s * dpr, n = Math.floor(px + 1e-6)
    let crisp = false
    if (n >= 1 && (px - n) / px <= 0.14) { s = n / dpr; crisp = true }
    let l = Math.max(0, (window.innerWidth - 960 * s) / 2) + Number(stage.dataset.dx || 0)
    let t = Math.max(0, (window.innerHeight - 540 * s) / 2) + Number(stage.dataset.dy || 0)
    if (crisp) { l = Math.round(l * dpr) / dpr; t = Math.round(t * dpr) / dpr }
    fitEl.style.transform = `translate(${l}px,${t}px) scale(${s})`
    stage.toggleAttribute('data-crisp', crisp) // an attribute, not a class: React owns the class
    sc = { n, crisp, dpr }
    paint(); matrix()
  }

  const mo = new MutationObserver(() => { paint(); matrix() })
  mo.observe(stage, { subtree: true, childList: true, characterData: true, attributes: true })
  const evs = ['pointerdown', 'pointerup', 'pointercancel', 'input', 'keyup'] as const
  evs.forEach(e => document.addEventListener(e, paint, true))
  stage.addEventListener('scroll', paint, true)
  window.addEventListener('resize', fit)
  stage.addEventListener('transitionend', matrix)
  document.fonts?.ready.then(() => { ASC = {}; paint(); matrix() }).catch(() => {})
  fit()

  return () => {
    dead = true
    mo.disconnect(); cancelAnimationFrame(raf); clearTimeout(mxTimer)
    evs.forEach(e => document.removeEventListener(e, paint, true))
    stage.removeEventListener('scroll', paint, true)
    window.removeEventListener('resize', fit)
    stage.removeEventListener('transitionend', matrix)
    mx.innerHTML = ''
  }
}

function alphaOf(el: Element | null, root: Element): number {
  let a = 1
  while (el && el !== root) { const o = Number(getComputedStyle(el).opacity); if (o < 1) a *= o; el = el.parentElement }
  return a
}
/** Every ancestor that clips its content (an LCD window, a scrolling list, a cut-off line). */
function clipsOf(el: Element, root: Element): Element[] {
  const had = CLIP.get(el)
  if (had) return had
  const r: Element[] = []
  for (let e: Element | null = el; e && e !== root; e = e.parentElement) if (getComputedStyle(e).overflowX !== 'visible') r.push(e)
  CLIP.set(el, r)
  return r
}
const fontOf = (cs: CSSStyleDeclaration) => `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
function ascent(ctx: Ctx, font: string): [number, number] {
  if (!ASC[font]) { const m = ctx.measureText('Hg'); ASC[font] = [m.fontBoundingBoxAscent, m.fontBoundingBoxDescent] }
  return ASC[font]
}
/** An icon rasterised once at panel size in one colour. */
function icon(id: string, col: string, size: number, repaint: () => void): HTMLCanvasElement | null {
  const key = `${id}|${col}|${size}`
  if (ICONS.has(key)) return ICONS.get(key) ?? null
  ICONS.set(key, null)
  const sym = document.getElementById(id)
  if (!sym) return null
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = size
    c.getContext('2d')?.drawImage(img, 0, 0, size, size)
    ICONS.set(key, c); repaint()
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${sym.getAttribute('viewBox')}" style="color:${col}">${sym.innerHTML}</svg>`)
  return null
}

function drawLayer(canvas: HTMLCanvasElement, stage: HTMLElement, repaint: () => void) {
  const root = canvas.parentElement
  const ctx = canvas.getContext('2d')
  if (!root || !ctx) return
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  const rr = root.getBoundingClientRect()
  if (!rr.width || !rr.height) return
  const k = rr.width / W, night = stage.dataset.theme === 'night'
  const X = (v: number) => (v - rr.left) / k, Y = (v: number) => (v - rr.top) / k
  const mine = (el: Element) => el.closest('[data-layer]') === root

  root.querySelectorAll<HTMLElement>('.knob').forEach(kn => {
    if (!mine(kn)) return
    const r = kn.getBoundingClientRect(), p = kn.querySelector('path'), d = p?.getAttribute('d')
    if (!r.width || !p || !d) return
    ctx.save(); ctx.translate(X(r.left), Y(r.top)); ctx.strokeStyle = getComputedStyle(p).stroke; ctx.lineWidth = 2.5; ctx.lineCap = 'round'
    ctx.stroke(new Path2D(d)); ctx.restore()
  })
  root.querySelectorAll('svg use').forEach(u => {
    const sv = u.parentElement
    if (!sv || !sv.parentElement || !mine(sv)) return
    const r = sv.getBoundingClientRect()
    if (!r.width) return
    const ic = icon((u.getAttribute('href') || '').slice(1), getComputedStyle(sv.parentElement).color, Math.round(r.width / k), repaint)
    if (ic) { ctx.globalAlpha = alphaOf(sv.parentElement, root); ctx.drawImage(ic, Math.round(X(r.left)), Math.round(Y(r.top))); ctx.globalAlpha = 1 }
  })

  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), range = document.createRange()
  let nd: Node | null
  while ((nd = tw.nextNode())) {
    const txt = (nd as Text).data
    if (!/\S/.test(txt)) continue
    const el = nd.parentElement
    if (!el || !mine(el)) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden') continue
    const a0 = txt.search(/\S/), a1 = txt.search(/\s*$/)
    range.setStart(nd, a0); range.setEnd(nd, a1)
    const rects = range.getClientRects()
    if (!rects.length || !rects[0].width) continue
    const font = fontOf(cs)
    ctx.save(); ctx.font = font; ctx.fillStyle = cs.color; ctx.globalAlpha = alphaOf(el, root)
    const cl = clipsOf(el, root)
    if (cl.length) {
      let l = -1e9, t = -1e9, r = 1e9, b = 1e9
      for (const c of cl) { const cr = c.getBoundingClientRect(); l = Math.max(l, cr.left); t = Math.max(t, cr.top); r = Math.min(r, cr.right); b = Math.min(b, cr.bottom) }
      if (r <= l || b <= t) { ctx.restore(); continue }
      ctx.beginPath(); ctx.rect(X(l), Y(t), (r - l) / k, (b - t) / k); ctx.clip()
    }
    const asc = ascent(ctx, font)[0]
    if (el.classList.contains('kl')) {
      const er = el.getBoundingClientRect()
      ctx.translate(Math.round(X(er.left + er.width / 2)), Math.round(Y(er.top + er.height / 2))); ctx.rotate(-Math.PI / 4)
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt.trim(), 0, 0)
    } else if (rects.length === 1) {
      ctx.fillText(txt.slice(a0, a1), Math.round(X(rects[0].left)), Math.round(Y(rects[0].top) + asc))
    } else {
      const re = /\S+/g
      let m: RegExpExecArray | null
      while ((m = re.exec(txt))) {
        range.setStart(nd, m.index); range.setEnd(nd, m.index + m[0].length)
        const r = range.getClientRects()[0]
        if (r) ctx.fillText(m[0], Math.round(X(r.left)), Math.round(Y(r.top) + asc))
      }
    }
    ctx.restore()
  }

  root.querySelectorAll('input').forEach(inp => {
    if (!mine(inp)) return
    const r = inp.getBoundingClientRect()
    if (!r.width) return
    const cs = getComputedStyle(inp), font = fontOf(cs), shown = inp.value || inp.placeholder
    if (!shown) return
    ctx.save(); ctx.font = font; ctx.fillStyle = cs.color; ctx.globalAlpha = inp.value ? 1 : 0.45
    ctx.beginPath(); ctx.rect(X(r.left), Y(r.top), r.width / k, r.height / k); ctx.clip()
    const a = ascent(ctx, font)
    ctx.fillText(inp.type === 'password' ? '*'.repeat(inp.value.length) : shown, Math.round(X(r.left) + parseFloat(cs.paddingLeft)), Math.round(Y(r.top) + (r.height / k - a[0] - a[1]) / 2 + a[0]))
    ctx.restore()
  })

  // glass sheen over every LCD: one soft falloff from the lit corner
  root.querySelectorAll('.lw').forEach(e => {
    if (!mine(e)) return
    const r = e.getBoundingClientRect()
    if (!r.width) return
    const x = X(r.left), y = Y(r.top), w = r.width / k, h = r.height / k, len = Math.min(w, h * 2.4)
    const g = ctx.createLinearGradient(x, y, x + len * 0.75, y + len * 0.42)
    g.addColorStop(0, `rgba(255,255,255,${night ? 0.05 : 0.11})`); g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g; ctx.fillRect(Math.round(x) + 1, Math.round(y) + 1, Math.round(w) - 2, Math.round(h) - 2)
  })
}

/** LCD pixel matrix: one cell per panel pixel over every visible LCD. Only at whole-number scales of 2x or more. */
function drawMatrix(stage: HTMLElement, mx: HTMLElement, sc: Scale) {
  if (!sc.crisp || sc.n < 2) { mx.innerHTML = ''; return }
  const n = sc.n, u = 1 / sc.dpr, railOnly = stage.dataset.split === 'full'
  const veil = !!stage.querySelector('#veil'), note = stage.querySelector('#note'), noteOn = !!note?.classList.contains('show')
  const nr = note?.getBoundingClientRect()
  let h = ''
  stage.querySelectorAll<HTMLElement>('.lw').forEach(e => {
    const r = e.getBoundingClientRect()
    if (!r.width || !r.height) return
    if (railOnly && !e.closest('#rail')) return
    const inNote = !!e.closest('#note'), inPop = !!e.closest('.pop'), al = e.dataset.mx === 'soft' ? 0.1 : 0.26
    if (inNote && !noteOn) return
    if (veil && !inPop && !inNote) return
    if (noteOn && nr && !inNote && r.left < nr.right && r.right > nr.left && r.top < nr.bottom && r.bottom > nr.top) return
    const a = (n - 1) * u, b = n * u, g = `rgba(0,0,0,0) 0 ${a}px,rgba(0,0,0,${al}) ${a}px ${b}px`
    h += `<i style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:${2 * b}px;background:repeating-linear-gradient(90deg,${g}),repeating-linear-gradient(0deg,${g})"></i>`
  })
  mx.innerHTML = h
}
