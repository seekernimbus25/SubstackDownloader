'use client';
import { useEffect, useRef, useState } from 'react';
import {
  fileExistsInDirectory,
  hasMarkdownForSlug,
  listDirectoryFilenames,
  supportsFolderExport,
  writeTextFileToDirectory,
} from '@/lib/bulkFolderExport';
import { getConnectModalHints } from '@/lib/substackConnectUi';
import styles from './page.module.css';

const FORMAT_LABELS = { md: 'Markdown', docx: 'DOCX', pdf: 'PDF' };

export default function Home() {
  const [tab, setTab] = useState('single');
  const [url, setUrl] = useState('');
  const [pubUrl, setPubUrl] = useState('');
  const [sid, setSid] = useState('');
  const [sidDraft, setSidDraft] = useState('');
  const [rememberSid, setRememberSid] = useState(true);
  const [sidConnected, setSidConnected] = useState(false);
  const [sidChecking, setSidChecking] = useState(false);
  const [sidMessage, setSidMessage] = useState('');
  const [showConnectModal, setShowConnectModal] = useState(false);
  /** @type {'paste' | 'guided' | 'localcli'} */
  const [sidModalSection, setSidModalSection] = useState('paste');
  const [format, setFormat] = useState('md');
  const [browserCapture, setBrowserCapture] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [singleConvertWarning, setSingleConvertWarning] = useState(null);
  const [singleConvertInfo, setSingleConvertInfo] = useState(null);
  const [folderApiSupported, setFolderApiSupported] = useState(false);
  const [folderSkipExisting, setFolderSkipExisting] = useState(true);
  const [folderForceOverwrite, setFolderForceOverwrite] = useState(false);
  const [folderExportActive, setFolderExportActive] = useState(false);
  const [folderExportProgress, setFolderExportProgress] = useState(null);
  const [folderExportSummary, setFolderExportSummary] = useState(null);
  const [bulkPosts, setBulkPosts] = useState([]);
  const [bulkPostsLoading, setBulkPostsLoading] = useState(false);
  const [bulkPostsLoadedForUrl, setBulkPostsLoadedForUrl] = useState('');
  const [bulkFilter, setBulkFilter] = useState('');
  const [selectedSlugs, setSelectedSlugs] = useState(() => new Set());
  const folderAbortRef = useRef(null);

  useEffect(() => {
    const savedSid = window.sessionStorage.getItem('offstackvault.sid');
    if (savedSid) {
      setSid(savedSid);
      setSidConnected(true);
      setSidMessage('You\'re signed in for this tab.');
    }
  }, []);

  useEffect(() => {
    setFolderApiSupported(supportsFolderExport());
  }, []);

  useEffect(() => {
    setBulkPosts([]);
    setSelectedSlugs(new Set());
    setBulkPostsLoadedForUrl('');
    setBulkFilter('');
  }, [pubUrl, sidConnected, sid]);

  function switchTab(nextTab) {
    setTab(nextTab);
    setError(null);
    setSingleConvertWarning(null);
    setSingleConvertInfo(null);
    setFolderExportSummary(null);
  }

  function openConnectModal() {
    setSidDraft(sid);
    setSidMessage('');
    setSidModalSection('paste');
    setShowConnectModal(true);
  }

  function disconnectSid() {
    setSid('');
    setSidDraft('');
    setSidConnected(false);
    setSidMessage('Signed out. Connect again to access paid posts.');
    window.sessionStorage.removeItem('offstackvault.sid');
  }

  async function connectSid() {
    const validationUrl = pubUrl || url;
    if (!validationUrl) {
      setSidMessage('Please enter an article or publication URL first.');
      return;
    }
    if (!sidDraft) {
      setSidMessage('Paste your login token to continue.');
      return;
    }

    setSidChecking(true);
    setSidMessage('');
    try {
      const res = await fetch('/api/validate-sid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: validationUrl, sid: sidDraft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not validate session');

      setSid(sidDraft);
      setSidConnected(true);
      setShowConnectModal(false);
      setSidMessage('Connected. You can now access paid posts.');
      if (rememberSid) {
        window.sessionStorage.setItem('offstackvault.sid', sidDraft);
      } else {
        window.sessionStorage.removeItem('offstackvault.sid');
      }
    } catch (err) {
      setSidConnected(false);
      setSidMessage(err.message);
    } finally {
      setSidChecking(false);
    }
  }

  async function handleSingle(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSingleConvertWarning(null);
    setSingleConvertInfo(null);

    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, sid: sid || '', format, browserCapture }),
      });

      let blob;
      let filename;

      if (format === 'md') {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (data.warnings?.word_count_discrepancy && data.warnings?.message) {
          setSingleConvertWarning(data.warnings.message);
        } else if (data.browser_capture) {
          setSingleConvertInfo(
            'Downloaded using your sign-in — full article captured.'
          );
        } else if (data.html_body_fallback) {
          setSingleConvertInfo(
            'We used the full subscriber version of this article to make sure nothing was missing.'
          );
        }
        blob = new Blob([data.markdown], { type: 'text/markdown' });
        const slug = (data.title || 'article')
          .replace(/[^a-z0-9]+/gi, '-')
          .toLowerCase()
          .replace(/^-|-$/g, '');
        filename = `${slug}.md`;
      } else {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error);
        }
        blob = await res.blob();
        const disposition = res.headers.get('Content-Disposition') || '';
        const match = disposition.match(/filename="([^"]+)"/);
        filename = match ? match[1] : `article.${format}`;
      }

      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAll(e) {
    e.preventDefault();
    if (!sidConnected || !sid) {
      setError('You need to sign in first — click Connect Substack above.');
      return;
    }
    if (!bulkPosts.length || bulkPostsLoadedForUrl !== pubUrl) {
      setError('Load your articles first, then choose which ones to export.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const slugs = Array.from(selectedSlugs);
      if (!slugs.length) {
        throw new Error('Select at least one post to export.');
      }
      const proceedWithZip = window.confirm(
        [
          'ZIP is created on the server and can fail on large exports.',
          'If that happens, your download may stop before it finishes.',
          '',
          'Best option: use "Export Markdown to folder" in Chrome or Edge.',
          'Most reliable for huge exports: run this project on your own computer (it can still take a while).',
          '',
          'Continue with ZIP download now?',
        ].join('\n')
      );
      if (!proceedWithZip) return;
      const res = await fetch('/api/convert-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pubUrl, sid, format: 'md', browserCapture, slugs }),
      });
      if (!res.ok) {
        let message = `Server error: ${res.status}`;
        try {
          const data = await res.json();
          if (data.error) message = data.error;
        } catch {}
        throw new Error(message);
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = match ? match[1] : 'offstackvault-articles.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadBulkPosts() {
    if (!sidConnected || !sid) {
      setError('You need to sign in first — click Connect Substack above.');
      return;
    }
    if (!pubUrl?.trim()) {
      setError('Please enter the publication URL first.');
      return;
    }

    setError(null);
    setBulkPostsLoading(true);
    try {
      const listRes = await fetch('/api/bulk/list-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pubUrl, sid }),
      });
      const listData = await listRes.json();
      if (!listRes.ok) throw new Error(listData.error || 'Failed to list posts');
      setBulkPosts(listData.posts || []);
      setSelectedSlugs(new Set((listData.posts || []).map((p) => p.slug)));
      setBulkPostsLoadedForUrl(pubUrl);
    } catch (err) {
      setError(err.message || 'Could not load post list.');
    } finally {
      setBulkPostsLoading(false);
    }
  }

  function toggleSelectedSlug(slug) {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function selectAllVisiblePosts(visiblePosts) {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      for (const p of visiblePosts) next.add(p.slug);
      return next;
    });
  }

  function clearAllVisiblePosts(visiblePosts) {
    setSelectedSlugs((prev) => {
      const next = new Set(prev);
      for (const p of visiblePosts) next.delete(p.slug);
      return next;
    });
  }

  function cancelFolderExport() {
    folderAbortRef.current?.abort();
  }

  async function handleExportToFolder() {
    if (!sidConnected || !sid) {
      setError('You need to sign in first — click Connect Substack above.');
      return;
    }
    if (!pubUrl?.trim()) {
      setError('Please enter the publication URL first.');
      return;
    }
    if (!folderApiSupported) {
      setError(
        'This browser cannot pick a local folder. Use Chrome or Edge, or download the ZIP instead.'
      );
      return;
    }
    if (!bulkPosts.length || bulkPostsLoadedForUrl !== pubUrl) {
      setError('Load your articles first, then choose which ones to export.');
      return;
    }
    const selectedPosts = bulkPosts.filter((p) => selectedSlugs.has(p.slug));
    if (!selectedPosts.length) {
      setError('Select at least one post to export.');
      return;
    }

    setError(null);
    setFolderExportSummary(null);

    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(err.message || 'Could not open folder.');
      return;
    }

    folderAbortRef.current = new AbortController();
    const { signal } = folderAbortRef.current;

    setFolderExportActive(true);
    setFolderExportProgress({ phase: 'listing', index: 0, total: 0, slug: '', filename: '' });

    let written = 0;
    let skipped = 0;
    let failed = 0;
    let total = 0;
    let publication = '';

    try {
      publication = new URL(pubUrl).hostname;
      const posts = selectedPosts;
      total = posts.length;
      const manifestPosts = [];
      const failures = [];
      const existingFilenames =
        !folderForceOverwrite && folderSkipExisting ? await listDirectoryFilenames(dirHandle) : null;

      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        setFolderExportProgress({
          phase: 'export',
          index: i + 1,
          total,
          slug: post.slug,
          filename: post.filename,
        });

        const shouldSkip =
          !folderForceOverwrite &&
          folderSkipExisting &&
          (Boolean(existingFilenames?.has(post.filename)) ||
            hasMarkdownForSlug(existingFilenames, post.slug) ||
            (await fileExistsInDirectory(dirHandle, post.filename)));
        if (shouldSkip) {
          skipped += 1;
          manifestPosts.push({ slug: post.slug, filename: post.filename, status: 'skipped' });
          continue;
        }

        const exportRes = await fetch('/api/bulk/export-one', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: pubUrl,
            sid,
            slug: post.slug,
            browserCapture,
            listPost: {
              slug: post.slug,
              title: post.title,
              post_date: post.post_date,
            },
          }),
          signal,
        });
        const exportData = await exportRes.json();
        if (!exportRes.ok) {
          failed += 1;
          const errMsg = exportData.error || 'Export failed';
          failures.push({ slug: post.slug, error: errMsg });
          manifestPosts.push({
            slug: post.slug,
            filename: post.filename,
            status: 'failed',
            error: errMsg,
          });
          continue;
        }

        await writeTextFileToDirectory(dirHandle, exportData.filename, exportData.markdown);
        existingFilenames?.add(exportData.filename);
        written += 1;
        manifestPosts.push({
          slug: post.slug,
          filename: exportData.filename,
          status: 'written',
        });
      }

      const manifest = {
        exportedAt: new Date().toISOString(),
        publicationUrl: pubUrl,
        publication,
        format: 'md',
        browserCapture,
        skipIfExists: folderSkipExisting && !folderForceOverwrite,
        forceOverwrite: folderForceOverwrite,
        counts: { total, written, skipped, failed },
        failures,
        posts: manifestPosts,
      };
      await writeTextFileToDirectory(
        dirHandle,
        'offstackvault-export-manifest.json',
        JSON.stringify(manifest, null, 2)
      );
      const readme = [
        'OffStackVault — bulk export',
        '',
        `Publication: ${publication}`,
        `Exported (UTC): ${manifest.exportedAt}`,
        '',
        `Written: ${written}  Skipped (already present): ${skipped}  Failed: ${failed}  Total listed: ${total}`,
        '',
        'This folder contains Markdown files plus offstackvault-export-manifest.json with per-post status.',
        'Re-run export with "Skip existing files" to resume after an interrupted download.',
        '',
        'OffStackVault is not affiliated with Substack.',
      ].join('\n');
      await writeTextFileToDirectory(dirHandle, 'EXPORT_README.txt', readme);

      setFolderExportSummary({ cancelled: false, written, skipped, failed, total });
    } catch (err) {
      if (err?.name === 'AbortError') {
        setFolderExportSummary({ cancelled: true, written, skipped, failed, total });
      } else {
        setError(err.message || 'Folder export failed.');
      }
    } finally {
      setFolderExportActive(false);
      setFolderExportProgress(null);
      folderAbortRef.current = null;
    }
  }

  const formatToggle = (
    <div className={styles.formatToggle}>
      {['md', 'docx', 'pdf'].map((value) => (
        <button
          key={value}
          type="button"
          className={`${styles.formatBtn} ${format === value ? styles.formatBtnActive : ''}`}
          onClick={() => setFormat(value)}
        >
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );

  const browserCaptureToggle = sidConnected ? (
    <label className={styles.captureOption}>
      <input
        type="checkbox"
        checked={browserCapture}
        onChange={(e) => setBrowserCapture(e.target.checked)}
      />
      <span>
        <strong>Slow but thorough download</strong> — use this if your article comes out
        incomplete. Takes longer but captures everything on the page.
      </span>
    </label>
  ) : null;

  const normalizedBulkFilter = bulkFilter.trim().toLowerCase();
  const visibleBulkPosts = normalizedBulkFilter
    ? bulkPosts.filter((post) => {
        const hay = `${post.title || ''} ${post.slug || ''}`.toLowerCase();
        return hay.includes(normalizedBulkFilter);
      })
    : bulkPosts;
  const selectedCount = selectedSlugs.size;

  return (
    <main className={styles.page}>
      <div className={styles.accentBar} />

      <nav className={styles.nav}>
        <div className={styles.contentMax}>
          <div className={styles.logo}>
            <span className={styles.logoOff}>Off</span>
            <span className={styles.logoStack}>Stack</span>
            <span className={styles.logoVault}>Vault</span>
          </div>
          <div className={styles.navRight}>
            <a href="#features" className={styles.navLink}>
              How it works
            </a>
            <span className={styles.badge}>Free Tool</span>
          </div>
        </div>
      </nav>

      <div className={styles.mainColumn}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Substack Downloader</p>
        <h1 className={styles.headline}>
          Your articles,
          <br />
          <span className={styles.underlined}>off</span> the platform.
        </h1>
        <p className={styles.desc}>
          Download any Substack article as <strong>Markdown, DOCX, or PDF</strong> for
          public posts or paywalled content you subscribe to.
        </p>
      </section>

      <div className={styles.card} id="download">
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'single' ? styles.tabActive : ''}`}
            onClick={() => switchTab('single')}
          >
            Single Article
          </button>
          <button
            className={`${styles.tab} ${tab === 'all' ? styles.tabActive : ''}`}
            onClick={() => switchTab('all')}
          >
            All Articles
          </button>
        </div>

        {tab === 'single' ? (
          <form className={styles.form} onSubmit={handleSingle}>
            <label className={styles.fieldLabel} htmlFor="single-url">
              Article URL
            </label>
            <input
              id="single-url"
              className={styles.input}
              type="url"
              placeholder="https://www.news.aakashg.com/p/your-post"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            {formatToggle}
            {browserCaptureToggle}
            <div className={styles.connectRow}>
              <div className={styles.connectState}>
                <span className={sidConnected ? styles.dotConnected : styles.dotDisconnected} />
                {sidConnected ? 'Signed in to Substack' : 'Not signed in'}
              </div>
              <div className={styles.connectActions}>
                <button className={styles.btnSecondary} type="button" onClick={openConnectModal}>
                  {sidConnected ? 'Reconnect' : 'Sign in to Substack'}
                </button>
                {sidConnected && (
                  <button className={styles.btnGhost} type="button" onClick={disconnectSid}>
                    Disconnect
                  </button>
                )}
              </div>
            </div>
            <p className={styles.hint}>
              Only needed for paid articles. Free public posts download without signing in.
            </p>
            {sidConnected && browserCapture && (
              <p className={styles.hint}>
                This option only works when running the project on your own computer. It won&apos;t
                work on this hosted website.
              </p>
            )}
            {sidMessage && <p className={styles.status}>{sidMessage}</p>}
            {error && <p className={styles.error}>{error}</p>}
            {singleConvertWarning && (
              <p className={styles.warning} role="status">
                {singleConvertWarning}
              </p>
            )}
            {singleConvertInfo && (
              <p className={styles.status} role="status">
                {singleConvertInfo}
              </p>
            )}
            <button className={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? 'Downloading...' : `Download as ${FORMAT_LABELS[format]}`}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={handleAll}>
            <div className={styles.hostedWarning}>
              <strong>Heads up:</strong> Bulk downloads can time out on this website because of
              hosting limits. For large archives, we recommend{' '}
              <a
                href="https://github.com/seekernimbus25/offstackvault"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.hostedWarningLink}
              >
                running the project on your own computer
              </a>{' '}
              — it&apos;s free, takes about 5 minutes to set up, and has no time limits.
            </div>
            <label className={styles.fieldLabel} htmlFor="pub-url">
              Publication URL
            </label>
            <input
              id="pub-url"
              className={styles.input}
              type="url"
              placeholder="https://www.news.aakashg.com"
              value={pubUrl}
              onChange={(e) => setPubUrl(e.target.value)}
              required
            />
            {browserCaptureToggle}
            <div className={styles.connectRow}>
              <div className={styles.connectState}>
                <span className={sidConnected ? styles.dotConnected : styles.dotDisconnected} />
                {sidConnected ? 'Signed in to Substack' : 'Not signed in'}
              </div>
              <div className={styles.connectActions}>
                <button className={styles.btnSecondary} type="button" onClick={openConnectModal}>
                  {sidConnected ? 'Reconnect' : 'Sign in to Substack'}
                </button>
                {sidConnected && (
                  <button className={styles.btnGhost} type="button" onClick={disconnectSid}>
                    Disconnect
                  </button>
                )}
              </div>
            </div>
            <p className={styles.hint}>
              We never ask for your Substack password — only a login token that proves you&apos;re a subscriber.
            </p>
            {sidConnected && browserCapture && (
              <p className={styles.warning}>
                This option only works when running the project on your own computer — it won&apos;t
                work on this hosted website. Large archives can also take a long time.
              </p>
            )}
            {sidMessage && <p className={styles.status}>{sidMessage}</p>}
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.postPickerActions}>
              <button
                className={styles.btnSecondary}
                type="button"
                onClick={loadBulkPosts}
                disabled={loading || folderExportActive || bulkPostsLoading || !sidConnected || !pubUrl}
              >
                {bulkPostsLoading ? 'Loading articles...' : 'Load my articles'}
              </button>
              {bulkPosts.length > 0 && bulkPostsLoadedForUrl === pubUrl && (
                <span className={styles.postPickerCount}>
                  {selectedCount} selected of {bulkPosts.length}
                </span>
              )}
            </div>
            {bulkPosts.length > 0 && bulkPostsLoadedForUrl === pubUrl && (
              <div className={styles.postPickerBox}>
                <label className={styles.fieldLabel} htmlFor="bulk-post-filter">
                  Choose articles
                </label>
                <input
                  id="bulk-post-filter"
                  className={styles.input}
                  type="text"
                  placeholder="Search by title"
                  value={bulkFilter}
                  onChange={(e) => setBulkFilter(e.target.value)}
                />
                <div className={styles.postPickerToolbar}>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => selectAllVisiblePosts(visibleBulkPosts)}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => clearAllVisiblePosts(visibleBulkPosts)}
                  >
                    Deselect all
                  </button>
                </div>
                <div className={styles.postPickerList}>
                  {visibleBulkPosts.map((post) => (
                    <label key={post.slug} className={styles.postPickerRow}>
                      <input
                        type="checkbox"
                        checked={selectedSlugs.has(post.slug)}
                        onChange={() => toggleSelectedSlug(post.slug)}
                      />
                      <span className={styles.postPickerTitle}>{post.title || post.slug}</span>
                    </label>
                  ))}
                  {!visibleBulkPosts.length && (
                    <p className={styles.hint}>No articles match your search.</p>
                  )}
                </div>
              </div>
            )}
            <div className={styles.folderExportOptions}>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={folderSkipExisting}
                  disabled={folderForceOverwrite}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setFolderSkipExisting(v);
                    if (v) setFolderForceOverwrite(false);
                  }}
                />
                Skip articles already downloaded (safe to re-run)
              </label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={folderForceOverwrite}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setFolderForceOverwrite(v);
                    if (v) setFolderSkipExisting(false);
                  }}
                />
                Re-download everything from scratch
              </label>
            </div>
            {folderExportProgress && (
              <div className={styles.folderProgress}>
                {folderExportProgress.phase === 'listing' && <span>Loading article list…</span>}
                {folderExportProgress.phase === 'export' && (
                  <span>
                    {folderExportProgress.index} / {folderExportProgress.total} — {folderExportProgress.filename}
                  </span>
                )}
              </div>
            )}
            {folderExportSummary && (
              <p className={styles.status} role="status">
                {folderExportSummary.cancelled
                  ? `Cancelled. Saved ${folderExportSummary.written}, skipped ${folderExportSummary.skipped} already saved, ${folderExportSummary.failed} failed.`
                  : `Done! Saved ${folderExportSummary.written} articles, skipped ${folderExportSummary.skipped} already saved, ${folderExportSummary.failed} failed (${folderExportSummary.total} total). A summary file was also saved to your folder.`}
              </p>
            )}
            <div className={styles.bulkActions}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleExportToFolder}
                disabled={
                  loading ||
                  folderExportActive ||
                  !folderApiSupported ||
                  !bulkPosts.length ||
                  bulkPostsLoadedForUrl !== pubUrl ||
                  selectedCount === 0
                }
              >
                {folderExportActive ? 'Exporting to folder…' : 'Export Markdown to folder…'}
              </button>
              <button
                className={styles.btnSecondary}
                type="submit"
                disabled={
                  loading ||
                  folderExportActive ||
                  !bulkPosts.length ||
                  bulkPostsLoadedForUrl !== pubUrl ||
                  selectedCount === 0
                }
              >
                {loading ? 'Preparing download...' : 'Download ZIP (Markdown)'}
              </button>
            </div>
            <p className={styles.warning}>
              ZIP downloads can fail on large exports. Use{' '}
              <strong>Export Markdown to folder</strong> in Chrome/Edge when possible. For very large
              exports, running this project on your own computer is usually the most reliable option.
            </p>
            {!folderApiSupported && (
              <p className={styles.hint}>
                This browser cannot save directly to a folder. ZIP is the fallback here. For better
                reliability, open this in Chrome or Edge and use folder export.
              </p>
            )}
            {folderExportActive && (
              <button type="button" className={styles.btnGhostWide} onClick={cancelFolderExport}>
                Cancel folder export
              </button>
            )}
          </form>
        )}
      </div>

      {showConnectModal && (
        <div className={styles.modalBackdrop} role="presentation">
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Sign in to access your paid posts</h2>
            <p className={styles.modalLead}>
              We never ask for your Substack password. Instead, you copy a login token from your
              browser and paste it here — that&apos;s all we need to prove you&apos;re a subscriber.
            </p>
            <div
              className={styles.modalSegment}
              role="tablist"
              aria-label="How to get your login token"
            >
              <button
                type="button"
                role="tab"
                aria-selected={sidModalSection === 'paste'}
                className={`${styles.modalSegmentBtn} ${sidModalSection === 'paste' ? styles.modalSegmentBtnActive : ''}`}
                onClick={() => setSidModalSection('paste')}
              >
                Copy &amp; Paste
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidModalSection === 'guided'}
                className={`${styles.modalSegmentBtn} ${sidModalSection === 'guided' ? styles.modalSegmentBtnActive : ''}`}
                onClick={() => setSidModalSection('guided')}
              >
                Step-by-step guide
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidModalSection === 'localcli'}
                className={`${styles.modalSegmentBtn} ${sidModalSection === 'localcli' ? styles.modalSegmentBtnActive : ''}`}
                onClick={() => setSidModalSection('localcli')}
              >
                Advanced (for developers)
              </button>
            </div>

            {sidModalSection === 'paste' && (
              <div className={styles.modalSectionBody}>
                <p className={styles.modalStepsIntro}>
                  Already know how to find your login token in your browser? Paste it in the field
                  below. Switch to <strong>Step-by-step guide</strong> if you need help finding it.
                </p>
              </div>
            )}

            {sidModalSection === 'guided' && (
              <div className={styles.modalSectionBody}>
                <p className={styles.modalCallout}>
                  <strong>Why can&apos;t I just log in here?</strong> For your security, your
                  browser prevents this site from seeing what happens on Substack&apos;s site. So
                  you sign into Substack separately in another tab, then copy a login token and
                  paste it here — that&apos;s all we need.
                </p>
                {(() => {
                  const validationUrlForConnect = pubUrl || url;
                  const connectHints = getConnectModalHints(validationUrlForConnect);
                  return (
                    <>
                      {!validationUrlForConnect?.trim() && (
                        <p className={styles.warning}>
                          Enter an article or publication URL in the form behind this dialog first — we&apos;ll
                          link you to the right sign-in page.
                        </p>
                      )}
                      {connectHints && (
                        <div className={styles.modalLinkRow}>
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={() =>
                              window.open(connectHints.origin, '_blank', 'noopener,noreferrer')
                            }
                          >
                            Open publication
                          </button>
                          <button
                            type="button"
                            className={styles.btnSecondary}
                            onClick={() =>
                              window.open(
                                connectHints.publicationLoginUrl,
                                '_blank',
                                'noopener,noreferrer'
                              )
                            }
                          >
                            Open the sign-in page
                          </button>
                          {connectHints.isSubstackHost && (
                            <button
                              type="button"
                              className={styles.btnSecondary}
                              onClick={() =>
                                window.open(
                                  connectHints.substackAccountSignInUrl,
                                  '_blank',
                                  'noopener,noreferrer'
                                )
                              }
                            >
                              Open substack.com sign-in
                            </button>
                          )}
                        </div>
                      )}
                      <ol className={styles.modalSteps}>
                        <li>
                          Use the buttons above to open Substack and sign in until you can see your
                          subscriber content.
                        </li>
                        <li>
                          In that tab, open your browser&apos;s developer tools: press{' '}
                          <strong>F12</strong> (or right-click the page → Inspect), then go to{' '}
                          <strong>Application → Cookies</strong>. Find the cookie named{' '}
                          <code className={styles.inlineCode}>
                            {connectHints?.expectedCookieName || 'substack.sid or connect.sid'}
                          </code>{' '}
                          and copy its value.
                        </li>
                        <li>Paste that value into the field below and click Connect.</li>
                      </ol>
                    </>
                  );
                })()}
              </div>
            )}

            {sidModalSection === 'localcli' && (
              <div className={styles.modalSectionBody}>
                <p className={styles.modalStepsIntro}>
                  If you&apos;ve cloned this project and are running it on your own computer, you can
                  use a helper script that opens a browser, lets you sign in, and copies the token
                  automatically — no manual steps needed.
                </p>
                <pre className={styles.monoBlock}>
                  {`npm run session:dump -- ${JSON.stringify(
                    (pubUrl || url || 'https://your-publication.com').trim() || 'https://your-publication.com'
                  )}`}
                </pre>
                <ol className={styles.modalSteps}>
                  <li>
                    Run the command above from the project folder. If you haven&apos;t installed the
                    browser yet, run <code className={styles.inlineCode}>npx playwright install chromium</code> first.
                  </li>
                  <li>Sign in inside the browser window that opens, then press Enter in your terminal.</li>
                  <li>Copy the line it prints into the field below and click Connect.</li>
                </ol>
                <p className={styles.hint}>
                  This only works on your own computer — the hosted version of this site cannot do it
                  for the same security reasons explained above.
                </p>
              </div>
            )}

            <label className={styles.fieldLabel} htmlFor="sid-connect-input">
              Your login token
            </label>
            <input
              id="sid-connect-input"
              className={styles.input}
              type="password"
              placeholder="Paste your token here"
              value={sidDraft}
              onChange={(e) => setSidDraft(e.target.value)}
            />
            {(() => {
              const connectHints = getConnectModalHints(pubUrl || url);
              if (!connectHints || connectHints.isSubstackHost) return null;
              return (
                <p className={styles.hint}>
                  Using a custom domain? If connect fails, try the same publication URL without{' '}
                  <code className={styles.inlineCode}>www</code>.
                </p>
              );
            })()}
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={rememberSid}
                onChange={(e) => setRememberSid(e.target.checked)}
              />
              Keep me signed in until I close this tab
            </label>
            {sidMessage && <p className={styles.error}>{sidMessage}</p>}
            <div className={styles.modalActions}>
              <button
                className={styles.btnSecondary}
                type="button"
                onClick={() => setShowConnectModal(false)}
              >
                Cancel
              </button>
              <button
                className={styles.btnPrimary}
                type="button"
                onClick={connectSid}
                disabled={sidChecking}
              >
                {sidChecking ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className={styles.features} id="features" aria-labelledby="features-heading">
        <h2 id="features-heading" className={styles.featuresTitle}>
          How it works
        </h2>
        <p className={styles.featuresLead}>
          OffStackVault runs in your browser and talks to Substack only when you click download. No
          account here — paste a URL, pick a format, and get a file you can archive, search, or edit
          offline.
        </p>

        <ul className={styles.featureList}>
          <li className={styles.featureItem}>
            <span className={styles.featureNum}>1</span>
            <div>
              <h3 className={styles.featureItemTitle}>Single article</h3>
              <p className={styles.featureItemText}>
                Paste any Substack article URL (<code className={styles.inlineCode}>substack.com</code>{' '}
                or a custom domain like <code className={styles.inlineCode}>news.aakashg.com</code>
                ),
                choose <strong>Markdown</strong>, <strong>DOCX</strong>, or <strong>PDF</strong>, then
                download. Public posts work without signing in.
              </p>
            </div>
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureNum}>2</span>
            <div>
              <h3 className={styles.featureItemTitle}>Paywalled posts</h3>
              <p className={styles.featureItemText}>
                Click <strong>Sign in to Substack</strong> and follow the steps to prove you&apos;re
                a subscriber. We never ask for your password — only a login token copied from your
                own browser. It is never stored on our servers and is only used for the downloads
                you trigger.
              </p>
            </div>
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureNum}>3</span>
            <div>
              <h3 className={styles.featureItemTitle}>Whole publication (ZIP or folder)</h3>
              <p className={styles.featureItemText}>
                Switch to <strong>All Articles</strong>, enter the publication homepage URL, connect
                your account, then download a ZIP or — in Chrome or Edge — save each post directly
                into a folder on your computer as it downloads. <strong>For large archives, this
                website may time out.</strong> For the best experience,{' '}
                <a
                  href="https://github.com/seekernimbus25/offstackvault"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  run the project locally from GitHub
                </a>{' '}
                — it&apos;s free and has no time limits.
              </p>
            </div>
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureNum}>4</span>
            <div>
              <h3 className={styles.featureItemTitle}>Privacy &amp; responsibility</h3>
              <p className={styles.featureItemText}>
                Your login token is only kept in <strong>this browser tab</strong> until you sign
                out or close it. Only download content you have a subscription to access.
                Not affiliated with Substack.
              </p>
            </div>
          </li>
        </ul>

        <p className={styles.featuresCta}>
          <a href="#download" className={styles.featuresCtaLink}>
            Back to download
          </a>
        </p>

        <div className={styles.pills}>
          {['Free & paid posts', 'MD / DOCX / PDF', 'Bulk ZIP', 'Subscriber access'].map(
            (feature) => (
              <div key={feature} className={styles.pill}>
                <span className={styles.pillDot} />
                {feature}
              </div>
            )
          )}
        </div>
      </section>
      </div>

      <footer className={styles.footer}>
        <div className={styles.contentMax}>
          <span className={styles.footerBrand}>
            Off<span className={styles.footerAccent}>Stack</span>Vault
          </span>
          <span className={styles.footerNote}>Not affiliated with Substack</span>
        </div>
      </footer>
    </main>
  );
}
