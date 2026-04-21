import SiteHeader from '../components/SiteHeader';

export const metadata = {
  title: 'Privacy Policy | SubstackDownloader',
  description: 'Privacy policy for SubstackDownloader.',
};

export default function PrivacyPolicyPage() {
  return (
    <>
      <SiteHeader />
      <main className="legalPage">
        <h1>Privacy Policy</h1>
        <p className="legalMeta">Last updated: April 21, 2026</p>
        <p>
          This policy explains what information SubstackDownloader processes and how we handle it.
        </p>
        <h2>Information we process</h2>
        <ul>
          <li>Article or publication URLs you submit for conversion</li>
          <li>Technical request data needed to run the service</li>
          <li>Login token input only for the actions you trigger</li>
        </ul>
        <h2>How login tokens are handled</h2>
        <p>
          Your token is used only to perform requested downloads and is not intended for persistent
          storage by our service.
        </p>
        <h2>Cookies and advertising</h2>
        <p>
          We use Google AdSense. Google may use cookies to serve and personalize ads according to
          its policies.
        </p>
        <h2>Contact</h2>
        <p>
          Privacy questions:{' '}
          <a href="mailto:substackdownloader@gmail.com">substackdownloader@gmail.com</a>
        </p>
      </main>
    </>
  );
}
