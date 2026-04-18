'use client';
import { useState } from 'react';
import styles from './page.module.css';

export default function Home() {
  const [tab, setTab] = useState('single');
  const [url, setUrl] = useState('');
  const [pubUrl, setPubUrl] = useState('');
  const [sid, setSid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function switchTab(t) {
    setTab(t);
    setError(null);
  }

  async function handleSingle(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const blob = new Blob([data.markdown], { type: 'text/markdown' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const slug = (data.title || 'article')
        .replace(/[^a-z0-9]+/gi, '-')
        .toLowerCase()
        .replace(/^-|-$/g, '');
      a.download = `${slug}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAll(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/convert-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: pubUrl, sid }),
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
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'offstackvault-articles.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.accentBar} />

      <nav className={styles.nav}>
        <div className={styles.logo}>
          <span className={styles.logoOff}>Off</span>
          <span className={styles.logoStack}>Stack</span>
          <span className={styles.logoVault}>Vault</span>
        </div>
        <div className={styles.navRight}>
          <a href="#features" className={styles.navLink}>How it works</a>
          <span className={styles.badge}>Free Tool</span>
        </div>
      </nav>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Substack Downloader</p>
        <h1 className={styles.headline}>
          Your articles,<br />
          <span className={styles.underlined}>off</span> the platform.
        </h1>
        <p className={styles.desc}>
          Download any Substack article as a clean <strong>Markdown file</strong> —
          public posts or paywalled content you subscribe to.
        </p>
      </section>

      <div className={styles.card}>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === 'single' ? styles.tabActive : ''}`}
            onClick={() => switchTab('single')}
          >
            ↓ Single Article
          </button>
          <button
            className={`${styles.tab} ${tab === 'all' ? styles.tabActive : ''}`}
            onClick={() => switchTab('all')}
          >
            ⊞ All Articles
          </button>
        </div>

        {tab === 'single' ? (
          <form className={styles.form} onSubmit={handleSingle}>
            <label className={styles.fieldLabel} htmlFor="single-url">Article URL</label>
            <input
              id="single-url"
              className={styles.input}
              type="url"
              placeholder="https://example.substack.com/p/article-slug"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? 'Downloading…' : '↓ Download as Markdown'}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={handleAll}>
            <label className={styles.fieldLabel} htmlFor="pub-url">Publication URL</label>
            <input
              id="pub-url"
              className={styles.input}
              type="url"
              placeholder="https://example.substack.com"
              value={pubUrl}
              onChange={(e) => setPubUrl(e.target.value)}
              required
            />
            <label className={`${styles.fieldLabel} ${styles.fieldGap}`} htmlFor="sid-input">
              substack.sid Cookie
            </label>
            <input
              id="sid-input"
              className={styles.input}
              type="password"
              placeholder="s%3A..."
              value={sid}
              onChange={(e) => setSid(e.target.value)}
              required
            />
            <p className={styles.hint}>
              Chrome → DevTools → Application → Cookies → substack.com →{' '}
              <code>substack.sid</code>
            </p>
            {error && <p className={styles.error}>{error}</p>}
            <button className={styles.btnPrimary} type="submit" disabled={loading}>
              {loading ? 'Fetching articles…' : '↓ Download All as ZIP'}
            </button>
          </form>
        )}
      </div>

      <div className={styles.pills} id="features">
        {['Free articles', 'Paywalled content', 'Bulk ZIP download', 'Clean Markdown output'].map(
          (f) => (
            <div key={f} className={styles.pill}>
              <span className={styles.pillDot} />
              {f}
            </div>
          )
        )}
      </div>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>
          Off<span className={styles.footerAccent}>Stack</span>Vault
        </span>
        <span className={styles.footerNote}>Not affiliated with Substack</span>
      </footer>
    </main>
  );
}
