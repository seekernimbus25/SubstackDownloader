import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });

export async function fetchArticle(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch article: ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $('h1').first().text().trim() || 'Untitled';
  const author = $('meta[name="author"]').attr('content') || 'Unknown';
  const date = $('time').first().attr('datetime') || '';

  const articleEl = $('article');
  if (!articleEl.length) throw new Error('No article content found');

  const rawHtml = articleEl.html() ?? '';
  const body = td.turndown(rawHtml);
  const frontmatter = `# ${title}\n\n**Author:** ${author}  \n**Date:** ${date}\n\n---\n\n`;

  return { title, author, date, markdown: frontmatter + body };
}

export async function fetchAllPosts(publicationUrl, sid) {
  const { hostname } = new URL(publicationUrl);
  const headers = { Cookie: `substack.sid=${sid}` };

  const posts = [];
  let offset = 0;
  const limit = 25;

  while (true) {
    const res = await fetch(
      `https://${hostname}/api/v1/posts?sort=new&offset=${offset}&limit=${limit}`,
      { headers }
    );
    if (!res.ok) throw new Error(`Failed to fetch posts: ${res.status}`);
    const batch = await res.json();
    if (!batch.length) break;
    posts.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }

  const results = [];
  for (const post of posts) {
    const { slug } = post;
    const res = await fetch(`https://${hostname}/api/v1/posts/${slug}`, { headers });
    if (!res.ok) continue;
    const full = await res.json();

    const title = full.title || 'Untitled';
    const subtitle = full.subtitle || '';
    const author = full.publishedBylines?.[0]?.name || 'Unknown';
    const date = (full.post_date || '').slice(0, 10);
    const bodyHtml = full.body_html || '';

    const lines = [`# ${title}\n`];
    if (subtitle) lines.push(`*${subtitle}*`);
    lines.push(`\n**Author:** ${author}  \n**Date:** ${date}\n\n---\n`);
    lines.push(bodyHtml ? td.turndown(bodyHtml) : '*(No content — article may be paywalled)*');

    const filename = `${date ? date + '-' : ''}${slug}.md`;
    results.push({ filename, markdown: lines.join('\n') });
  }

  return results;
}
