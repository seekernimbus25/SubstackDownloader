import Link from 'next/link';

export default function SiteHeader() {
  return (
    <header className="siteHeader">
      <div className="siteHeaderInner">
        <Link href="/" className="siteHeaderBrand" aria-label="Go to homepage">
          <span className="siteHeaderBrandMain">Substack</span>
          <span className="siteHeaderBrandAccent">Downloader</span>
        </Link>
        <div className="siteHeaderRight">
          <Link href="/#features" className="siteHeaderNavLink">
            How it works
          </Link>
          <span className="siteHeaderBadge">Free Tool</span>
        </div>
      </div>
    </header>
  );
}
