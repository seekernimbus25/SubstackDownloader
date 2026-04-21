export const metadata = {
  title: 'Contact | SubstackDownloader',
  description: 'Contact support for SubstackDownloader.',
};

export default function ContactPage() {
  return (
    <main className="legalPage">
      <h1>Contact</h1>
      <p className="legalMeta">Last updated: April 21, 2026</p>
      <p>
        Need help or want to report an issue? Email us at{' '}
        <a href="mailto:substackdownloader@gmail.com">substackdownloader@gmail.com</a>.
      </p>
      <h2>Support scope</h2>
      <ul>
        <li>Bug reports and failed downloads</li>
        <li>Questions about supported formats and browsers</li>
        <li>Policy and legal questions about this site</li>
      </ul>
      <p>Typical response time is within 2-3 business days.</p>
    </main>
  );
}
