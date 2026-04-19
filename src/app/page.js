'use client';
import { useEffect, useState } from 'react';
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
  const [format, setFormat] = useState('md');
  const [browserCapture, setBrowserCapture] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [singleConvertWarning, setSingleConvertWarning] = useState(null);
  const [singleConvertInfo, setSingleConvertInfo] = useState(null);

  useEffect(() => {
    const savedSid = window.sessionStorage.getItem('offstackvault.sid');
    if (savedSid) {
      setSid(savedSid);
      setSidConnected(true);
      setSidMessage('Connected from this browser session.');
    }
  }, []);

  function switchTab(nextTab) {
    setTab(nextTab);
    setError(null);
    setSingleConvertWarning(null);
    setSingleConvertInfo(null);
  }

  function openConnectModal() {
    setSidDraft(sid);
    setSidMessage('');
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
      setSidMessage('Paste your substack.sid cookie to continue.');
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
        } else if (data.warnings?.possible_paid_teaser && data.warnings?.message) {
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
            <button className={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? 'Fetching articles...' : `Download ZIP (${FORMAT_LABELS[format]})`}
            </button>
          </form>
        )}
      </div>

      {showConnectModal && (
        <div className={styles.modalBackdrop} role="presentation">
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Connect your Substack session</h2>
            <ol className={styles.modalSteps}>
              <li>Sign in on substack.com in your browser.</li>
              <li>Open DevTools, then Application, then Cookies, then https://substack.com.</li>
              <li>Copy the value of <code>substack.sid</code> and paste below.</li>
            </ol>
            <label className={styles.fieldLabel} htmlFor="sid-connect-input">
              substack.sid cookie
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
                Use <strong>Connect Substack</strong> and paste your browser&apos;s{' '}
                <code className={styles.inlineCode}>substack.sid</code> cookie. We validate it on the
                server, then use it only for the requests you trigger. Your password is never asked
                for or stored on our servers.
              </p>
            </div>
          </li>
          <li className={styles.featureItem}>
            <span className={styles.featureNum}>3</span>
            <div>
              <h3 className={styles.featureItemTitle}>Whole publication (ZIP)</h3>
              <p className={styles.featureItemText}>
                Switch to <strong>All Articles</strong>, enter the publication homepage URL, connect
                your session, pick a format, and download a ZIP of every post we can fetch with your
                access. Large archives may take longer; hosted timeouts apply on Vercel.
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
