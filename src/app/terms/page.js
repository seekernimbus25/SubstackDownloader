import SiteHeader from '../components/SiteHeader';

export const metadata = {
  title: 'Terms of Use | SubstackDownloader',
  description: 'Terms of use for SubstackDownloader.',
};

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="legalPage">
        <h1>Terms of Use</h1>
        <p className="legalMeta">Last updated: April 21, 2026</p>
        <p>By using SubstackDownloader, you agree to these terms.</p>
        <h2>Acceptable use</h2>
        <ul>
          <li>Use this tool only for content you are legally allowed to access.</li>
          <li>Do not use the service to bypass paywalls or redistribute protected content.</li>
          <li>Follow applicable copyright laws and platform terms.</li>
        </ul>
        <h2>Service availability</h2>
        <p>
          We may modify, pause, or discontinue parts of the service at any time, including limits
          for stability or abuse prevention.
        </p>
        <h2>Disclaimer</h2>
        <p>
          The service is provided &quot;as is&quot; without warranties. We are not responsible for
          how users choose to use downloaded content.
        </p>
        <h2>Contact</h2>
        <p>
          Terms questions:{' '}
          <a href="mailto:substackdownloader@gmail.com">substackdownloader@gmail.com</a>
        </p>
      </main>
    </>
  );
}
