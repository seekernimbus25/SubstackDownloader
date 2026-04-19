#!/usr/bin/env node
/**
 * Opens Chromium (via Playwright), lets you sign in to Substack on the publication origin,
 * then prints substack.sid or connect.sid from that browser context.
 *
 * Usage: node scripts/dump-substack-session.cjs <publication-or-article-url>
 *    or: npm run session:dump -- https://example.substack.com
 *
 * Paste the printed value into OffStackVault as the session cookie. This only works locally
 * with Node + Playwright; the web app cannot read cookies from your normal browser tabs.
 */

const readline = require('readline');

async function main() {
  const { chromium } = require('playwright');

  const urlArg = process.argv[2];
  if (!urlArg) {
    console.error('Usage: node scripts/dump-substack-session.cjs <publication-or-article-url>');
    process.exit(1);
  }

  let hostname;
  let origin;
  try {
    const u = new URL(urlArg);
    hostname = u.hostname;
    origin = u.origin;
  } catch {
    console.error('Invalid URL');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin, { waitUntil: 'domcontentloaded' });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\nA Chromium window opened. Log in to Substack there if needed.');
  console.log('When you are signed in, return here and press Enter.\n');
  await new Promise((resolve) => rl.once('line', resolve));
  rl.close();

  const cookies = await context.cookies();
  const picked = pickSessionCookie(cookies, hostname);

  if (!picked) {
    console.error(
      'Could not find substack.sid or connect.sid. Cookie names seen:',
      [...new Set(cookies.map((c) => c.name))].join(', ') || '(none)'
    );
    await browser.close();
    process.exit(1);
  }

  console.log('\n--- Paste this value into OffStackVault (session cookie) ---');
  console.log(picked.value);
  console.log(`--- (detected ${picked.name}) ---\n`);
  await browser.close();
}

/**
 * @param {import('playwright').Cookie[]} cookies
 * @param {string} hostname
 */
function pickSessionCookie(cookies, hostname) {
  const substackSid = cookies.find((c) => c.name === 'substack.sid');
  const connectCandidates = cookies.filter((c) => c.name === 'connect.sid');
  const isSubstackHost = hostname === 'substack.com' || hostname.endsWith('.substack.com');

  if (isSubstackHost && substackSid) {
    return { name: 'substack.sid', value: substackSid.value };
  }

  const hostNoWww = hostname.replace(/^www\./, '');
  const matchConnect = connectCandidates.find((c) => {
    const d = (c.domain || '').replace(/^\./, '');
    return d === hostname || d === hostNoWww || hostname.endsWith(d);
  });

  if (matchConnect) {
    return { name: 'connect.sid', value: matchConnect.value };
  }
  if (connectCandidates.length > 0) {
    return { name: 'connect.sid', value: connectCandidates[0].value };
  }
  if (substackSid) {
    return { name: 'substack.sid', value: substackSid.value };
  }
  return null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
