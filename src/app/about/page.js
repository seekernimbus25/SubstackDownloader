import SiteHeader from '../components/SiteHeader';

export const metadata = {
  title: 'About | SubstackDownloader',
  description: 'Learn what SubstackDownloader does and who it is for.',
};

export default function AboutPage() {
  return (
    <>
      <SiteHeader />
      <main className="legalPage">
        <h1>About SubstackDownloader</h1>
        <p className="legalMeta">Last updated: April 21, 2026</p>
        <p>
          SubstackDownloader helps readers save articles they are allowed to access so they can read
          them later in Markdown, DOCX, or PDF format.
        </p>
        <h2>What we do</h2>
        <p>
          We provide a conversion tool for public posts and subscriber content that you already have
          access to through your own account.
        </p>
        <h2>What we do not do</h2>
        <ul>
          <li>We do not provide access to content you are not entitled to view.</li>
          <li>We do not ask for your Substack password.</li>
          <li>We are not affiliated with Substack.</li>
        </ul>
      </main>
    </>
  );
}
