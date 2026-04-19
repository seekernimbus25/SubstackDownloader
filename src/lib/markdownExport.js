/**
 * Turn common Markdown patterns into plain, readable text for PDF/DOCX export.
 * (Embedded images are not drawn — we describe them with caption + URL instead.)
 */
export function humanizeMarkdownForExport(markdown) {
  let s = markdown;

  // Images first: ![alt](url) — avoid dumping huge CDN URLs as a single unbroken line
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, alt, url) => {
    const label = (alt || '').trim() || 'Image';
    const displayUrl = url.length > 120 ? `${url.slice(0, 117)}...` : url;
    return `[Figure: ${label}]\n${displayUrl}`;
  });

  // Links: [text](url) -> text (url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    const displayUrl = url.length > 120 ? `${url.slice(0, 117)}...` : url;
    return `${text} (${displayUrl})`;
  });

  return s;
}
