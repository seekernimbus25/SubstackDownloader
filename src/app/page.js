'use client';
import { useEffect, useRef, useState } from 'react';
import {
  fileExistsInDirectory,
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
  const folderAbortRef = useRef(null);

  useEffect(() => {
    const savedSid = window.sessionStorage.getItem('offstackvault.sid');
    if (savedSid) {
      setSid(savedSid);
      setSidConnected(true);
      setSidMessage('Connected from this browser session.');
    }
  }, []);

  useEffect(() => {
    setFolderApiSupported(supportsFolderExport());
  }, []);

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
    setSidMessage('Disconnected. Reconnect to access paywalled posts.');
    window.sessionStorage.removeItem('offstackvault.sid');
  }

  async function connectSid() {
    const validationUrl = pubUrl || url;
    if (!validationUrl) {
      setSidMessage('Add a Substack URL first so we can validate your session.');
      return;
    }
    if (!sidDraft) {
      setSidMessage('Paste your session cookie value to continue (substack.sid or connect.sid).');
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
      setSidMessage('Connected. You can now access paywalled content.');
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
            'Exported using headless Chromium with your session so client-rendered content is included.'
          );
        } else if (data.html_body_fallback) {
          setSingleConvertInfo(
            'We used the full article HTML from the subscriber page — the JSON API had sent a shorter body.'
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
      setError('Connect your Substack session first.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/convert-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pubUrl, sid, format, browserCapture }),
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

  function cancelFolderExport() {
    folderAbortRef.current?.abort();
  }

  async function handleExportToFolder() {
    if (!sidConnected || !sid) {
      setError('Connect your Substack session first.');
      return;
    }
    if (!pubUrl?.trim()) {
      setError('Enter your publication URL first.');
      return;
    }
    if (format !== 'md') {
      setError(
        'Export to folder is only available for Markdown. Choose MD above or use Download ZIP for other formats.'
      );
      return;
    }
    if (!folderApiSupported) {
      setError(
        'This browser cannot pick a local folder. Use Chrome or Edge, or download the ZIP instead.'
      );
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
      const listRes = await fetch('/api/bulk/list-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pubUrl, sid }),
        signal,
      });
      const listData = await listRes.json();
      if (!listRes.ok) throw new Error(listData.error || 'Failed to list posts');

      const { posts } = listData;
      publication = listData.publication || '';
      total = posts.length;
      const manifestPosts = [];
      const failures = [];

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
          !folderForceOverwrite && folderSkipExisting && (await fileExistsInDirectory(dirHandle, post.filename));
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
        <strong>Full browser capture</strong> loads the post in headless Chromium with your
        Substack session and waits for client-rendered content. It is slower, but helps when
        Substack only reveals the full article after the page app hydrates.
      </span>
    </label>
  ) : null;

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
                {sidConnected ? 'Substack connected' : 'Not connected'}
              </div>
              <div className={styles.connectActions}>
                <button className={styles.btnSecondary} type="button" onClick={openConnectModal}>
                  {sidConnected ? 'Reconnect' : 'Connect Substack'}
                </button>
                {sidConnected && (
                  <button className={styles.btnGhost} type="button" onClick={disconnectSid}>
                    Disconnect
                  </button>
                )}
              </div>
            </div>
            <p className={styles.hint}>
              Required only for paywalled articles. Public posts download without connecting.
            </p>
            {sidConnected && browserCapture && (
              <p className={styles.hint}>
                Requires Playwright Chromium on the host. If it is not installed, run
                <code> npx playwright install chromium </code>.
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
            {formatToggle}
            {browserCaptureToggle}
            <div className={styles.connectRow}>
              <div className={styles.connectState}>
                <span className={sidConnected ? styles.dotConnected : styles.dotDisconnected} />
                {sidConnected ? 'Substack connected' : 'Not connected'}
              </div>
              <div className={styles.connectActions}>
                <button className={styles.btnSecondary} type="button" onClick={openConnectModal}>
                  {sidConnected ? 'Reconnect' : 'Connect Substack'}
                </button>
                {sidConnected && (
                  <button className={styles.btnGhost} type="button" onClick={disconnectSid}>
                    Disconnect
                  </button>
                )}
              </div>
            </div>
            <p className={styles.hint}>
              We never ask for your password. You provide a session cookie and we validate it
              server-side.
            </p>
            {sidConnected && browserCapture && (
              <p className={styles.warning}>
                Browser capture can take many minutes for large archives and may exceed hosted
                runtime limits on serverless platforms.
              </p>
            )}
            {sidMessage && <p className={styles.status}>{sidMessage}</p>}
            {error && <p className={styles.error}>{error}</p>}
            {format === 'md' && (
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
                  Skip files that already exist (resume interrupted exports)
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
                  Overwrite all (re-download every post)
                </label>
              </div>
            )}
            {format !== 'md' && (
              <p className={styles.hint}>
                Export to a local folder is only available for Markdown. Choose MD to stream files into a
                folder, or use ZIP for {FORMAT_LABELS[format]}.
              </p>
            )}
            {folderExportProgress && (
              <div className={styles.folderProgress}>
                {folderExportProgress.phase === 'listing' && <span>Loading publication post list…</span>}
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
                  ? `Cancelled. Wrote ${folderExportSummary.written}, skipped ${folderExportSummary.skipped}, failed ${folderExportSummary.failed}.`
                  : `Finished. Wrote ${folderExportSummary.written}, skipped ${folderExportSummary.skipped}, failed ${folderExportSummary.failed} (${folderExportSummary.total} in list). Manifest and EXPORT_README.txt saved in your folder.`}
              </p>
            )}
            <div className={styles.bulkActions}>
              <button
                className={styles.btnPrimary}
                type="submit"
                disabled={loading || folderExportActive}
              >
                {loading ? 'Fetching articles...' : `Download ZIP (${FORMAT_LABELS[format]})`}
              </button>
              {format === 'md' && (
                <button
                  type="button"
                  className={styles.btnFolder}
                  onClick={handleExportToFolder}
                  disabled={loading || folderExportActive || !folderApiSupported}
                >
                  {folderExportActive ? 'Exporting to folder…' : 'Export Markdown to folder…'}
                </button>
              )}
            </div>
            {format === 'md' && !folderApiSupported && (
              <p className={styles.hint}>
                Folder export requires Chrome or Edge (File System Access API). Use Download ZIP on other
                browsers.
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
            <h2 className={styles.modalTitle}>Connect your Substack session</h2>
            <p className={styles.modalLead}>
              Choose how you want to provide your session. We validate the cookie on our server; we never
              ask for your Substack password in this app.
            </p>
            <div
              className={styles.modalSegment}
              role="tablist"
              aria-label="How to provide session cookie"
            >
              <button
                type="button"
                role="tab"
                aria-selected={sidModalSection === 'paste'}
                className={`${styles.modalSegmentBtn} ${sidModalSection === 'paste' ? styles.modalSegmentBtnActive : ''}`}
                onClick={() => setSidModalSection('paste')}
              >
                Paste cookie
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidModalSection === 'guided'}
                className={`${styles.modalSegmentBtn} ${sidModalSection === 'guided' ? styles.modalSegmentBtnActive : ''}`}
                onClick={() => setSidModalSection('guided')}
              >
                Sign in first
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidModalSection === 'localcli'}
                className={`${styles.modalSegmentBtn} ${sidModalSection === 'localcli' ? styles.modalSegmentBtnActive : ''}`}
                onClick={() => setSidModalSection('localcli')}
              >
                Local helper
              </button>
            </div>

            {sidModalSection === 'paste' && (
              <div className={styles.modalSectionBody}>
                <p className={styles.modalStepsIntro}>
                  Paste the value of <code className={styles.inlineCode}>substack.sid</code> (on{' '}
                  <code className={styles.inlineCode}>.substack.com</code>) or{' '}
                  <code className={styles.inlineCode}>connect.sid</code> (on a custom domain). Copy it
                  from DevTools → Application → Cookies for the right site.
                </p>
              </div>
            )}

            {sidModalSection === 'guided' && (
              <div className={styles.modalSectionBody}>
                <p className={styles.modalCallout}>
                  <strong>Why not “Log in here”?</strong> Your browser does not let this website read
                  cookies from <code className={styles.inlineCode}>substack.com</code> or your
                  publication (that would let any site steal sessions). So you sign in in a{' '}
                  <em>Substack tab</em>, then copy the session cookie into the field below.
                </p>
                {(() => {
                  const validationUrlForConnect = pubUrl || url;
                  const connectHints = getConnectModalHints(validationUrlForConnect);
                  return (
                    <>
                      {!validationUrlForConnect?.trim() && (
                        <p className={styles.warning}>
                          Add a publication or article URL in the form behind this dialog first, so we can
                          link you to the right login page.
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
                            Open /login on publication
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
                          Use the buttons above (or your usual bookmarks) and sign in to Substack until
                          you see your account or subscriber content.
                        </li>
                        <li>
                          Open DevTools → Application → Cookies. For this URL you should copy{' '}
                          <code className={styles.inlineCode}>
                            {connectHints?.expectedCookieName || 'substack.sid or connect.sid'}
                          </code>
                          .
                        </li>
                        <li>Paste only the cookie value (often starts with <code className={styles.inlineCode}>s%3A</code>) into the field below.</li>
                      </ol>
                    </>
                  );
                })()}
              </div>
            )}

            {sidModalSection === 'localcli' && (
              <div className={styles.modalSectionBody}>
                <p className={styles.modalStepsIntro}>
                  If you run this project on your machine with Node, you can let Chromium handle login
                  and print the session cookie from that window — no manual DevTools copy.
                </p>
                <pre className={styles.monoBlock}>
                  {`npm run session:dump -- ${JSON.stringify(
                    (pubUrl || url || 'https://your-publication.com').trim() || 'https://your-publication.com'
                  )}`}
                </pre>
                <ol className={styles.modalSteps}>
                  <li>Run the command from the repo root (Playwright Chromium must be installed: <code className={styles.inlineCode}>npx playwright install chromium</code>).</li>
                  <li>Sign in in the browser window that opens, then press Enter in the terminal.</li>
                  <li>Copy the printed line into the field below and click Validate.</li>
                </ol>
                <p className={styles.hint}>
                  This does not run on our servers — only on your computer. The hosted website cannot do
                  this for you for the same browser-security reasons as above.
                </p>
              </div>
            )}

            <label className={styles.fieldLabel} htmlFor="sid-connect-input">
              Session cookie value
            </label>
            <input
              id="sid-connect-input"
              className={styles.input}
              type="password"
              placeholder="s%3A..."
              value={sidDraft}
              onChange={(e) => setSidDraft(e.target.value)}
            />
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={rememberSid}
                onChange={(e) => setRememberSid(e.target.checked)}
              />
              Remember in this browser session only
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
                {sidChecking ? 'Connecting...' : 'Validate and Connect'}
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
                Use <strong>Connect Substack</strong> and paste your session cookie:{' '}
                <code className={styles.inlineCode}>substack.sid</code> on{' '}
                <code className={styles.inlineCode}>.substack.com</code> sites, or{' '}
                <code className={styles.inlineCode}>connect.sid</code> on custom domains. We validate
                it on the server, then use it only for the requests you trigger. Your password is
                never asked for or stored on our servers.
              </p>
            </div>
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureNum}>3</span>
            <div>
              <h3 className={styles.featureItemTitle}>Whole publication (ZIP or folder)</h3>
              <p className={styles.featureItemText}>
                Switch to <strong>All Articles</strong>, enter the publication homepage URL, connect
                your session, then download a ZIP or — in Chrome or Edge with Markdown — export each
                post into a folder as it finishes (skip existing files to resume). Large archives may
                take longer; hosted timeouts apply on Vercel.
              </p>
            </div>
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureNum}>4</span>
            <div>
              <h3 className={styles.featureItemTitle}>Privacy &amp; responsibility</h3>
              <p className={styles.featureItemText}>
                Session data can be kept only in <strong>this browser tab&apos;s session</strong> until
                you disconnect. Use OffStackVault only for content you&apos;re allowed to access.
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
          {['Public & paywalled', 'MD / DOCX / PDF', 'Bulk ZIP', 'Session validated'].map(
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
