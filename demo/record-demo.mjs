// Records a narrated walkthrough of every BladiSolution feature.
//
//   cd demo && npm install && npm run record
//
// Requires the app running (default http://localhost:5173 with the API on :8000),
// Google Chrome, and ffmpeg. The demo data is reset before and after recording.
// Output: demo/output/bladisolution-demo.mp4

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env.BASE ?? 'http://localhost:5173'
const CHROME = process.env.CHROME ?? '/usr/bin/google-chrome-stable'
const RESET_CMD = process.env.RESET_CMD ?? `${HERE}/../backend/.venv/bin/python -m app.seed --reset`
const OUT = path.join(HERE, 'output')
const RAW = path.join(OUT, 'raw')
const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 390, height: 844 }
const DRY = process.env.DRY === '1' // validate every step quickly, without video
const SPEED = DRY ? 0.05 : 1
const NARRATE = process.env.VOICE !== '0' // VOICE=0 records without a voiceover
const NARRATION = path.join(HERE, 'narration')
const spokenTexts = new Set()
let voiceIndex = {}
if (NARRATE && !DRY) {
  const idx = path.join(NARRATION, 'index.json')
  if (!fs.existsSync(idx)) throw new Error('No narration found. Run `npm run record` (it runs the dry pass and synthesis first).')
  voiceIndex = JSON.parse(fs.readFileSync(idx, 'utf8'))
}

/** Caption HTML → text a speech engine reads naturally. */
function speakable(html) {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/BladiSolution/g, 'Bladi Solution')
    .replace(/ASCIC/g, 'A.S.C.I.C.')
    .replace(/Laâyoune/g, 'Laayoune')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\bAI\b/g, 'A.I.')
    .replace(/\bIoT\b/g, 'I.O.T.')
    .replace(/\bNGOs\b/g, 'N.G.O.s')
    .replace(/\s*→\s*/g, ', then ')
    .replace(/\s*—\s*/g, ', ')
    .replace(/…/g, '... ')
    .replace(/\s*·\s*/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
}

fs.rmSync(RAW, { recursive: true, force: true })
fs.mkdirSync(RAW, { recursive: true })

// ------------------------------------------------------------------ data setup
function resetData() {
  const [cmd, ...args] = RESET_CMD.split(' ')
  execFileSync(cmd, args, { cwd: path.join(HERE, '..', 'backend'), stdio: 'ignore' })
}

async function api(method, url, body, cookie) {
  const res = await fetch(`${BASE}/api${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { data: await res.json().catch(() => null), cookie: res.headers.get('set-cookie')?.split(';')[0] }
}

console.log('Resetting demo data…')
resetData()
// A spam comment for the moderation chapter.
const bot = await api('POST', '/auth/register', { name: 'Promo Deals Bot', email: `promo${Date.now()}@example.com`, password: 'not-a-real-user-1', role: 'citizen' })
if (!bot.cookie) throw new Error(`Could not create the demo spam account (${JSON.stringify(bot.data)}). If rate-limited, restart the API or wait 10 minutes.`)
await api('POST', '/problems/1/comments', { body: 'EARN 5000 MAD PER DAY FROM HOME!!! Click my profile for the secret method!!!' }, bot.cookie)
const talentSolutions = (await api('GET', '/users/youssef-amrani/solutions?page_size=20')).data.items
const lightReport = talentSolutions.find((s) => s.title.startsWith('Photo-based lighting'))

// ------------------------------------------------------------------ overlay helpers (injected in every page)
const OVERLAY = () => {
  const css = `
    #demo-cursor{position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
      background:rgba(201,96,58,.35);border:2px solid #c9603a;pointer-events:none;transition:transform .12s ease,background .12s}
    #demo-cursor.down{transform:scale(.7);background:rgba(201,96,58,.7)}
    #demo-caption{position:fixed;z-index:2147483646;left:50%;bottom:22px;transform:translateX(-50%);max-width:min(880px,92vw);
      background:rgba(27,25,22,.92);color:#fff;font:600 17px/1.4 "Plus Jakarta Sans",system-ui,sans-serif;padding:12px 20px;
      border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);pointer-events:none;text-align:center}
    #demo-caption b{color:#f2b52b}
    #demo-caption:empty{display:none}
    #demo-chapter{position:fixed;inset:0;z-index:2147483645;display:flex;flex-direction:column;align-items:center;justify-content:center;
      background:#0b5c42;color:#fff;font-family:"Plus Jakarta Sans",system-ui,sans-serif;text-align:center;padding:24px;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E%3Cg fill='none' stroke='%23ffffff' stroke-opacity='0.09' stroke-width='1.2'%3E%3Crect x='18' y='18' width='20' height='20'/%3E%3Crect x='18' y='18' width='20' height='20' transform='rotate(45 28 28)'/%3E%3C/g%3E%3C/svg%3E")}
    #demo-chapter .k{font-size:14px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#a8d8c0}
    #demo-chapter .t{margin-top:14px;font-size:clamp(30px,5vw,52px);font-weight:800;letter-spacing:-.02em;max-width:900px;line-height:1.1}
    #demo-chapter .s{margin-top:14px;font-size:clamp(15px,2vw,20px);color:#d3ecdf;max-width:760px}
  `
  // Overlay lives in a closed shadow root so it never matches the script's own locators.
  let root = null
  const mount = () => {
    if (root) return
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
    document.documentElement.appendChild(host)
    root = host.attachShadow({ mode: 'closed' })
    const style = document.createElement('style')
    style.textContent = css
    root.appendChild(style)
    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    const pos = JSON.parse(sessionStorage.getItem('demo-pos') || '[640,400]')
    cursor.style.left = pos[0] + 'px'
    cursor.style.top = pos[1] + 'px'
    const cap = document.createElement('div')
    cap.id = 'demo-caption'
    cap.innerHTML = sessionStorage.getItem('demo-caption') || ''
    root.append(cap, cursor)
    addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px'
      cursor.style.top = e.clientY + 'px'
      sessionStorage.setItem('demo-pos', JSON.stringify([e.clientX, e.clientY]))
    }, true)
    addEventListener('mousedown', () => cursor.classList.add('down'), true)
    addEventListener('mouseup', () => cursor.classList.remove('down'), true)
  }
  window.__demoCaption = (html) => {
    sessionStorage.setItem('demo-caption', html)
    const el = root?.getElementById('demo-caption')
    if (el) el.innerHTML = html
  }
  window.__demoChapter = (kicker, title, sub) => {
    root?.getElementById('demo-chapter')?.remove()
    if (!title || !root) return
    const el = document.createElement('div')
    el.id = 'demo-chapter'
    el.innerHTML = `<div class="k">${kicker}</div><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}`
    root.appendChild(el)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount)
  else mount()
}

// ------------------------------------------------------------------ actor
function actor(rec) {
  const { page } = rec
  const wait = (ms) => page.waitForTimeout(Math.round(ms * SPEED))
  /** Wait until the previous narration line has finished. */
  const untilQuiet = async () => {
    const left = rec.narrationEnd - Date.now()
    if (!DRY && left > 0) await page.waitForTimeout(left)
  }
  /** Start speaking a line now; returns its duration in ms. */
  const speak = (text) => {
    if (!NARRATE || !text) return 0
    if (DRY) {
      spokenTexts.add(text)
      return 0
    }
    const clip = voiceIndex[text]
    if (!clip) throw new Error(`No narration for "${text}". Run \`npm run record\` to regenerate it.`)
    rec.events.push({ t: (Date.now() - rec.start) / 1000, file: clip.file })
    rec.narrationEnd = Date.now() + clip.duration * 1000 + 300
    return clip.duration * 1000
  }
  const a = {
    page,
    wait,
    async caption(html, hold = 0) {
      const text = speakable(html)
      if (text) await untilQuiet()
      await page.evaluate((h) => window.__demoCaption(h), html)
      speak(text)
      if (hold) await wait(hold)
    },
    async chapter(kicker, title, sub, hold = 2600) {
      await untilQuiet()
      await page.evaluate(([k, t, s]) => window.__demoChapter(k, t, s), [kicker, title, sub])
      const ms = speak(speakable([kicker, title, sub].filter(Boolean).map((x) => x.replace(/[.!?]+$/, '')).join('. ') + '.'))
      await wait(Math.max(hold, ms + 400))
      await page.evaluate(() => window.__demoChapter())
    },
    async goto(url, hold = 900) {
      await page.goto(BASE + url, { waitUntil: 'networkidle' })
      await wait(hold)
    },
    async move(locator) {
      await locator.waitFor({ state: 'visible', timeout: 15000 })
      await locator.scrollIntoViewIfNeeded()
      const box = await locator.boundingBox()
      if (box) await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20), { steps: DRY ? 1 : 22 })
      await wait(180)
    },
    async click(locator, hold = 700) {
      await a.move(locator)
      await locator.click()
      await wait(hold)
    },
    async type(locator, text, delay = 26) {
      await a.click(locator, 150)
      await locator.pressSequentially(text, { delay: DRY ? 0 : delay })
      await wait(300)
    },
    async show(locator, hold = 1400) {
      await locator.waitFor({ state: 'visible', timeout: 15000 })
      await locator.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      await wait(700)
      await a.move(locator)
      await wait(hold)
    },
    async scroll(px, hold = 1100) {
      await page.evaluate((y) => window.scrollBy({ top: y, behavior: 'smooth' }), px)
      await wait(hold)
    },
    async top(hold = 700) {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      await wait(hold)
    },
    async login(label, who) {
      await a.goto('/login', 500)
      await a.caption(`Signing in as <b>${label}</b>${who ? ` — ${who}` : ''}`)
      await a.click(page.getByRole('button', { name: new RegExp(`${label} Demo`) }), 0)
      await page.waitForURL((u) => !u.pathname.startsWith('/login'))
      await page.getByRole('button', { name: 'Account menu' }).waitFor()
      await wait(1200)
    },
    async logout() {
      await a.click(page.getByRole('button', { name: 'Account menu' }), 500)
      await a.click(page.getByRole('button', { name: 'Sign out' }), 0)
      await page.getByRole('banner').getByRole('link', { name: 'Sign in' }).waitFor()
      await wait(1000)
    },
  }
  return a
}

process.on('unhandledRejection', () => {})
const browser = await chromium.launch({ executablePath: CHROME, args: ['--hide-scrollbars'] })
async function newRecording(viewport, name) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(DRY ? {} : { recordVideo: { dir: path.join(RAW, name), size: viewport } }) })
  await ctx.addInitScript(OVERLAY)
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  return { ctx, page, start: Date.now(), events: [], narrationEnd: 0 }
}
async function finish(rec, name) {
  const { ctx, page } = rec
  const left = rec.narrationEnd - Date.now()
  if (!DRY && left > 0) await page.waitForTimeout(left + 400)
  if (DRY) return ctx.close()
  rec.elapsed = (Date.now() - rec.start) / 1000
  const video = page.video()
  await ctx.close()
  const dest = path.join(RAW, `${name}.webm`)
  fs.renameSync(await video.path(), dest)
  rec.video = dest
  return dest
}

// ================================================================== DESKTOP
const desk = await newRecording(DESKTOP, 'desktop')
process.on('uncaughtException', async (err) => {
  console.error(err.message.split('\n').slice(0, 3).join('\n'))
  for (const p of browser.contexts().flatMap((c) => c.pages())) {
    await p.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {})
    console.error('Failure screenshot at', path.join(OUT, 'failure.png'), 'url', p.url())
  }
  process.exit(1)
})
const d = actor(desk)
const P = desk.page
const t0 = Date.now()
const mark = (s) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${s}`)

// ---------------------------------------------------------------- 1. Landing
mark('Landing')
await d.goto('/', 300)
await d.chapter('ASCIC Hackathon 2026', 'BladiSolution', 'Turn local problems into real solutions — an open civic innovation platform for Moroccan & African cities.', 3800)
await d.caption('Citizens, talents, organizations and cities solve local challenges <b>together</b>.', 2600)
await d.move(P.getByRole('link', { name: /Explore Problems/ }))
await d.caption('The hero shows a <b>live</b> trending problem and its top community solutions.')
await d.move(P.getByText('Top community solutions'))
await d.wait(2200)
await d.caption('The core loop: <b>Problem → Solutions → Community → Collaboration → Selection → Implementation</b>.')
await d.show(P.getByRole('heading', { name: 'A problem should not end as a complaint.' }), 2600)
await d.caption('Trending problems, the <b>latest civic solutions</b> and a live activity feed.')
await d.show(P.getByRole('heading', { name: 'Trending problems' }), 2400)
await d.caption('Solutions that already reached <b>real-world implementation</b>, with measured impact.')
await d.show(P.getByRole('heading', { name: 'From idea to implementation' }), 2600)
await d.caption('All <b>12 Smart City challenge areas</b>, and a place for every kind of contributor.')
await d.show(P.getByRole('heading', { name: '12 Smart City challenge areas' }), 2400)
await d.scroll(700, 1800)

// ---------------------------------------------------------------- 2. Explore
mark('Explore problems')
await d.chapter('Chapter 1', 'Explore local problems', 'Every problem is an open civic challenge.')
await d.goto('/problems', 600)
await d.caption('Problems from <b>8 Moroccan cities</b> — sort by trending, latest, most supported, discussed or needing solutions.', 1800)
await d.click(P.getByRole('button', { name: 'Waste Management', exact: true }), 1600)
await d.caption('Filter by category, city, status or official challenges.')
await d.click(P.getByRole('tab', { name: 'Most supported' }), 1600)
await d.click(P.getByRole('button', { name: 'All categories' }), 1200)
await d.click(P.getByRole('tab', { name: 'Needs solutions' }), 1800)
await d.click(P.getByRole('tab', { name: 'Trending' }), 900)

await d.caption('Our flagship problem: <b>Overflowing Waste Containers Around a Market</b> in Rabat.')
await d.click(P.getByRole('link', { name: 'Overflowing Waste Containers Around a Market' }).first(), 1500)
await d.caption('Location, date, reporter, full description — plus <b>supporters, followers, urgency and impact</b>.', 2400)
await d.move(P.getByLabel('Problem impact'))
await d.wait(2000)
await d.caption('<b>AI Insight</b> extracted the category, frequency, urgency, impact areas and affected population.')
await d.show(P.getByLabel('AI Insight'), 3200)
await d.caption('Solutions can be ranked by <b>Top</b> (community stars)…')
await d.show(P.getByRole('heading', { name: /Solutions/ }).first(), 2200)
await d.caption('…<b>Latest</b> — so new contributors are never buried by older popular solutions…')
await d.click(P.getByRole('tab', { name: 'Latest' }), 1800)
await d.caption('…<b>Discussed</b>, and <b>Implemented</b>.')
await d.click(P.getByRole('tab', { name: 'Discussed' }), 1500)
await d.click(P.getByRole('tab', { name: 'Implemented' }), 1600)
await d.click(P.getByRole('tab', { name: 'Top' }), 900)
await d.caption('<b>AI contributor matching</b> suggests people and organizations with the right skills.')
await d.show(P.getByRole('heading', { name: 'Potential Contributors' }), 2800)
await d.caption('And a <b>community discussion</b> with threaded replies.')
await d.show(P.getByRole('heading', { name: /Community Discussion/ }), 2400)

// ---------------------------------------------------------------- 3. Citizen
mark('Citizen: AI + duplicates')
await d.chapter('Chapter 2', 'A citizen reports a problem', 'AI structures the report and detects duplicates.')
await d.login('Citizen', 'Salma Benali, Rabat')
await d.caption('Demo accounts for each role are available on the login page.', 600)
await d.click(P.getByRole('button', { name: 'Create' }), 500)
await d.click(P.getByRole('link', { name: /Submit a Problem.*Describe/ }), 1000)
await d.caption('Salma writes in her own words…')
await d.type(P.locator('#title'), 'Garbage bins near the market are always full')
await d.type(P.locator('#description'), 'Garbage bins near the market are always full, especially on Friday and Saturday. Bags pile up on the pavement and the smell is terrible.', 18)
await d.caption('<b>Live duplicate detection</b>: the same problem was already reported — 85% similar.')
await d.show(P.getByRole('heading', { name: /Similar problems/ }), 2800)
await d.caption('<b>AI analysis</b> extracts category, urgency, frequency and keywords.')
await d.click(P.getByRole('button', { name: /Analyze with AI|Re-analyze/ }), 1400)
await d.show(P.getByLabel('AI Problem Analysis'), 2400)
await d.caption('One click applies the suggestions to the form.')
await d.click(P.getByRole('button', { name: 'Apply suggestions to the form' }), 1600)
await d.show(P.getByRole('radio', { name: 'Waste Management' }), 1600)
await d.click(P.getByRole('button', { name: 'Publish problem' }), 900)
await d.caption('Before publishing: <b>“We found a potentially similar problem.”</b> Support it, or create a new one.', 3200)
await d.caption('Salma chooses to <b>support the existing problem</b> — voices add up instead of splitting.')
await d.click(P.getByRole('button', { name: 'Support Existing Problem' }), 2000)
await d.caption('She is now a supporter and <b>follows</b> the problem — she will be notified of new solutions.')
await d.show(P.getByRole('button', { name: /Supported/ }), 2200)

mark('Citizen: new problem')
await d.caption('Now a genuinely <b>new</b> problem, in Laâyoune.')
await d.goto('/problems/new', 500)
await d.type(P.locator('#title'), 'Sand blocks the road to the bus station after every windstorm')
await d.type(P.locator('#description'), 'After every sandstorm, sand piles up on the road leading to the main bus station in Laayoune. Cars and buses get stuck and pedestrians walk in the street. It is dangerous at night because there is no lighting.', 14)
await d.caption('No duplicate found — and the AI recognises a <b>Transportation & Mobility</b> problem.')
await d.click(P.getByRole('button', { name: /Analyze with AI|Re-analyze/ }), 1300)
await d.click(P.getByRole('button', { name: 'Apply suggestions to the form' }), 900)
await d.click(P.locator('#city'), 300)
await P.locator('#city').selectOption('Laâyoune')
await d.wait(800)
await d.type(P.locator('#neighborhood'), 'Hay Al Wahda')
await d.type(P.locator('#location'), 'Road to the main bus station')
await d.caption('Citizens can <b>drop a pin on the map</b> and add a photo.')
const pickerMap = P.locator('.leaflet-container').first()
await d.show(pickerMap, 600)
{
  const box = await pickerMap.boundingBox()
  await P.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.45, { steps: 20 })
  await P.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.45)
}
await d.wait(1400)
await d.caption('Urgency and impact are set with simple, citizen-friendly controls.')
await d.click(P.getByRole('radio', { name: 'High' }).first(), 900)
await d.click(P.getByRole('button', { name: 'Publish problem' }), 2200)
await d.caption('Published! The problem is public, with its <b>AI insight</b> and suggested contributors.', 2400)
await d.show(P.getByLabel('AI Insight'), 2400)

mark('Citizen: profile & report')
await d.caption('Profiles carry <b>skills</b>, and users follow categories to hear about new problems.')
await d.goto('/settings', 600)
await d.type(P.locator('#s-skills'), 'Pharmacy')
await P.keyboard.press('Enter')
await d.wait(600)
await d.click(P.getByRole('switch', { name: /Healthcare/ }), 900)
await d.click(P.getByRole('button', { name: 'Save profile' }), 1500)
await d.caption('Anyone can <b>report</b> inappropriate content — here, a spam comment.')
await d.goto('/problems/1#discussion', 800)
const spam = P.locator('li', { hasText: 'EARN 5000 MAD' }).first()
await d.show(spam, 1400)
await d.click(spam.getByRole('button', { name: 'Report' }), 700)
await d.click(P.getByRole('dialog').getByText('Spam', { exact: true }), 500)
await d.type(P.locator('#report-details'), 'Advertising scam, unrelated to the problem.')
await d.click(P.getByRole('button', { name: 'Send report' }), 1500)
await d.logout()

// ---------------------------------------------------------------- 4. Talent
mark('Talent')
await d.chapter('Chapter 3', 'A talent proposes a solution', 'Students, engineers, startups and NGOs build solutions in public.')
await d.login('Talent', 'Youssef Amrani, full-stack & IoT engineer')
await d.goto('/problems/1', 600)
await d.caption('Every open problem has a <b>Submit a Solution</b> button.')
await d.click(P.getByRole('link', { name: 'Submit a Solution' }).first(), 1000)
await d.caption('A structured proposal: what, how it works, impact, implementation, skills, cost.')
await d.type(P.locator('#title'), 'Weekend Night Collection Round')
await d.type(P.locator('#description'), 'Add a dedicated collection round on Friday and Saturday nights around the market.', 16)
await d.type(P.locator('#approach'), 'The operator adds one truck between 22:00 and 02:00 on weekend nights, when the streets are empty and quick to cover.', 12)
await d.type(P.locator('#impact'), 'Containers start every market day empty; fewer overflow complaints.', 14)
await d.type(P.locator('#implementation_plan'), 'Negotiate an addendum with the operator and run a 2-month pilot.', 14)
await d.type(P.locator('#skills'), 'Logistics')
await P.keyboard.press('Enter')
await d.type(P.locator('#cost'), '≈ 30,000 MAD for the pilot')
await d.click(P.getByRole('button', { name: 'Publish solution' }), 2000)
await d.caption('The solution page: <b>status pipeline</b>, stars, sharing, and an <b>AI summary</b> for busy decision-makers.', 3000)
await d.show(P.getByLabel('AI Summary'), 2600)
await d.caption('The <b>Latest</b> tab shows it first, with a “New” badge.')
await d.goto('/problems/1?tab=latest#solutions', 2600)

mark('Talent: stars & comments')
await d.caption('GitHub-style <b>stars</b>: one per user, updated instantly.')
await d.goto('/solutions/1', 800)
await d.click(P.getByRole('button', { name: /Star this solution/ }).first(), 1800)
await d.caption('Public, constructive <b>discussion</b> on every solution.')
await d.type(P.locator('textarea[id^="c-solutions"]').first(), 'Our IoT sensors could provide the real-time ground truth for your model. Happy to help!', 16)
await d.click(P.getByRole('button', { name: 'Comment', exact: true }), 1800)
await d.caption('<b>Contact the contributor</b> directly — they receive your name and email.')
await d.top()
await d.click(P.getByRole('button', { name: 'Contact Contributor' }), 600)
await d.type(P.locator('#contact-msg'), 'Hi Amine, could we combine our approaches for the Akkari pilot?', 16)
await d.click(P.getByRole('button', { name: 'Send message' }), 1600)

if (lightReport) {
  mark('Talent: collaboration')
  await d.caption('<b>Collaboration</b>: someone asked to join Youssef’s team — he accepts.')
  await d.goto(`/solutions/${lightReport.id}#team`, 800)
  await d.show(P.getByText('Requests to join'), 1200)
  await d.click(P.getByRole('button', { name: 'Accept' }), 1800)
}

mark('Feeds')
await d.caption('The global <b>Latest Civic Solutions</b> feed — filter by category, city, neighbourhood, status, skill and date.')
await d.goto('/solutions', 1200)
await d.click(P.locator('#s-city'), 300)
await P.locator('#s-city').selectOption('Rabat')
await d.wait(1200)
await d.type(P.locator('#s-skill'), 'Python')
await d.wait(1200)
await d.caption('<b>Trending</b> is time-aware: recent stars and comments count most, so old solutions can’t dominate forever.')
await d.click(P.getByRole('tab', { name: 'Trending' }), 1800)
await d.click(P.getByRole('tab', { name: 'Implemented' }), 1800)
await d.logout()

// ---------------------------------------------------------------- 5. Community & discovery
mark('Discovery')
await d.chapter('Chapter 4', 'A living community', 'Notifications, profiles, search, discovery and the map.')
await d.login('Citizen', 'Salma again')
await d.caption('Real-event <b>notifications</b>: Salma follows the market problem, so she hears about the new solution.')
await d.click(P.getByRole('link', { name: /Notifications/ }), 2600)
await d.caption('Profiles show <b>civic impact</b> — implemented solutions, citizens impacted — not just popularity.')
await d.goto('/u/amine-el-baydaouy', 2600)
await d.scroll(500, 1600)
await d.goto('/u/sara-lahlou', 600)
await d.caption('Follow contributors to see when they publish new solutions.')
await d.click(P.getByRole('button', { name: 'Follow', exact: true }), 1400)
await d.caption('<b>Global search</b> across problems, solutions, people, organizations and tags.')
await d.click(P.locator('#global-search'), 200)
await P.locator('#global-search').pressSequentially('waste Rabat', { delay: 60 })
await P.keyboard.press('Enter')
await d.wait(2400)
await d.click(P.getByRole('button', { name: 'Python', exact: true }), 1200)
await d.click(P.getByRole('tab', { name: /People & orgs/ }), 2200)
await d.caption('<b>Discover</b>: trending & latest problems and solutions, top contributors, active organizations.')
await d.goto('/discover', 1800)
await d.scroll(700, 1600)
await d.scroll(700, 1600)
await d.caption('The <b>problem map</b> — markers by category, sized by urgency.')
await d.goto('/map', 1800)
await P.locator('path.leaflet-interactive').first().waitFor({ state: 'attached' })
await d.wait(800)
{
  const box = await P.locator('path.leaflet-interactive').nth(3).boundingBox()
  await P.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: DRY ? 1 : 22 })
  await d.wait(300)
  await P.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await P.locator('.leaflet-popup').waitFor()
  await d.wait(2400)
}
await d.caption('…or a <b>city intensity</b> view of where problems concentrate.')
await d.click(P.getByRole('radio', { name: 'City intensity' }), 2600)
await d.logout()

// ---------------------------------------------------------------- 6. Municipality
mark('Municipality')
await d.chapter('Chapter 5', 'From community support to implementation', 'Municipalities discover, select and implement the best solutions.')
await d.login('Municipality', 'Rabat Municipal Innovation Office')
await d.click(P.getByRole('link', { name: 'Dashboard' }).first(), 1200)
await d.caption('The <b>city civic dashboard</b>: open problems, active solutions, participation, implementation rate.', 2600)
await d.scroll(450, 2200)
await d.caption('Charts: problems & solutions by category, the implementation pipeline, problems by city, weekly participation.')
await d.scroll(500, 2400)
await d.caption('<b>Top community-supported solutions</b> — decide in one click.')
const row = P.locator('tr', { hasText: 'AI Waste Overflow Prediction' })
await d.show(row, 1200)
await d.move(row.locator('select'))
await row.locator('select').selectOption('selected')
await d.caption('<b>Under Evaluation → Selected.</b> The author and the problem’s followers are notified.', 2600)
await d.show(P.getByRole('heading', { name: 'Decision pipeline' }), 2200)
await d.caption('On the solution page, the institution records the <b>implementation and its impact</b>.')
await d.goto('/solutions/1', 1200)
await d.click(P.getByRole('button', { name: 'Implemented', exact: true }), 600)
await d.type(P.locator('#i-loc'), 'Souk Akkari, Rabat')
await d.type(P.locator('#i-impact'), 'Weekend overflow incidents down 45% during the pilot.', 16)
await d.type(P.locator('#i-cit'), '12400', 60)
await d.click(P.getByRole('button', { name: 'Mark as Implemented' }), 1600)
await d.top(900)
await d.caption('<b>Problem → Community → Solution → Implementation.</b> 12,400 citizens impacted.', 3200)
await d.caption('Institutions can also publish <b>official challenges</b> for the community to solve.')
await d.click(P.getByRole('button', { name: 'Create' }), 900)
await d.click(P.getByRole('link', { name: /Publish Official Challenge/ }), 1200)
await d.show(P.getByText('Publish as an official challenge'), 2000)
await d.logout()

// ---------------------------------------------------------------- 7. Moderation
mark('Moderation')
await d.chapter('Chapter 6', 'Safe public spaces', 'Reports, moderation and role-based permissions.')
await d.login('Moderator', 'moderation team')
await d.goto('/moderation', 900)
await d.caption('The <b>moderation queue</b> shows Salma’s report with the content preview.', 600)
await d.show(P.getByText('Advertising scam, unrelated to the problem.'), 2200)
await d.click(P.getByRole('button', { name: 'Hide content' }).first(), 1800)
await d.caption('Hidden: the spam is gone from the public discussion.')
await d.goto('/problems/1', 300)
await d.show(P.getByRole('heading', { name: /Community Discussion/ }), 2600)
await d.logout()
const desktopVideo = await finish(desk, 'desktop')

// ================================================================== MOBILE
mark('Mobile')
const mob = await newRecording(MOBILE, 'mobile')
const m = actor(mob)
const MP = mob.page
await m.goto('/', 300)
await m.chapter('Chapter 7', 'Mobile first', 'Designed for phones, not shrunk from desktop.', 2600)
await m.caption('A real <b>mobile navigation</b> bar.', 1600)
await m.scroll(600, 1200)
await m.click(MP.getByRole('navigation', { name: 'Mobile' }).getByRole('link', { name: 'Problems' }), 1400)
await m.click(MP.getByRole('link', { name: 'Overflowing Waste Containers Around a Market' }).first(), 1400)
await m.caption('The full problem page, built for one hand.')
await m.scroll(700, 1300)
await m.scroll(900, 1300)
await m.scroll(900, 1300)
await m.caption('<b>Create</b> sheet: submit a problem or propose a solution.')
await m.click(MP.getByRole('button', { name: 'Create' }), 1800)
await MP.keyboard.press('Escape')
await m.wait(400)
await m.click(MP.getByRole('button', { name: 'More' }), 1600)
await m.click(MP.getByRole('dialog', { name: 'Menu' }).getByRole('link', { name: 'Civic dashboard' }), 1400)
await m.scroll(600, 1400)
await m.caption('')
const mobileVideo = await finish(mob, 'mobile')

// ================================================================== END CARD
const end = await newRecording(DESKTOP, 'end')
const e = actor(end)
await e.goto('/', 200)
await e.chapter('BladiSolution', 'Turns local problems into collective action.', 'Problem → Community → Solution → Implementation · ASCIC Hackathon 2026', 5000)
const endVideo = await finish(end, 'end')
await browser.close()

console.log('Restoring demo data…')
resetData()

if (DRY) {
  fs.mkdirSync(NARRATION, { recursive: true })
  fs.writeFileSync(path.join(NARRATION, 'texts.json'), JSON.stringify([...spokenTexts], null, 1))
  console.log(`Dry run passed: every step works. ${spokenTexts.size} narration lines collected.`)
  process.exit(0)
}

// ================================================================== STITCH
mark('Encoding')
const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString())

/** One WAV per segment: every narration clip placed at the moment its caption appeared. */
function segmentAudio(rec, name) {
  let duration = probe(rec.video)
  if (!Number.isFinite(duration)) duration = rec.elapsed
  const out = path.join(RAW, `${name}.wav`)
  const args = ['-y', '-loglevel', 'error']
  if (!NARRATE || rec.events.length === 0) {
    args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', String(duration), out)
  } else {
    rec.events.forEach((ev) => args.push('-i', ev.file))
    const delayed = rec.events.map((ev, i) => `[${i}:a]adelay=${Math.round(ev.t * 1000)}:all=1[v${i}]`).join(';')
    const inputs = rec.events.map((_, i) => `[v${i}]`).join('')
    args.push(
      '-filter_complex',
      `${delayed};${inputs}amix=inputs=${rec.events.length}:normalize=0:dropout_transition=0,apad,atrim=0:${duration},aresample=44100[out]`,
      '-map', '[out]', '-ac', '2', out,
    )
  }
  execFileSync('ffmpeg', args)
  return out
}

const audio = [segmentAudio(desk, 'desktop'), segmentAudio(mob, 'mobile'), segmentAudio(end, 'end')]
const final = path.join(OUT, 'bladisolution-demo.mp4')
const W = DESKTOP.width
const H = DESKTOP.height
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-i', desktopVideo, '-i', mobileVideo, '-i', endVideo, '-i', audio[0], '-i', audio[1], '-i', audio[2],
  '-filter_complex',
  `[0:v]fps=30,format=yuv420p,setsar=1[a];` +
    `[1:v]fps=30,scale=-2:${H - 40},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x0b5c42,format=yuv420p,setsar=1[b];` +
    `[2:v]fps=30,format=yuv420p,setsar=1[c];` +
    `[a][3:a][b][4:a][c][5:a]concat=n=3:v=1:a=1[outv][outa]`,
  '-map', '[outv]', '-map', '[outa]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', final,
])
const secs = probe(final)
console.log(`\nDone: ${final}  (${Math.floor(secs / 60)}m${Math.round(secs % 60)}s, ${(fs.statSync(final).size / 1e6).toFixed(1)} MB, ${NARRATE ? 'with voiceover' : 'silent'})`)
