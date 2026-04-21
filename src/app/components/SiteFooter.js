import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="siteFooter">
      <div className="siteFooterInner">
        <span className="siteFooterBrand">
          Substack<span className="siteFooterAccent">Downloader</span>
        </span>
        <nav className="siteFooterLinks" aria-label="Legal and company links">
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy-policy">Privacy Policy</Link>
          <Link href="/terms">Terms of Use</Link>
        </nav>
      </div>
    </footer>
  );
}
