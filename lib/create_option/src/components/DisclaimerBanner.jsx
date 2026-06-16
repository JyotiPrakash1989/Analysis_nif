import './DisclaimerBanner.css';

export default function DisclaimerBanner() {
  return (
    <div className="disclaimer-banner">
      <span className="disclaimer-icon" aria-hidden>ℹ</span>
      <p className="disclaimer-text">
        For educational and research purposes only. Past performance does not guarantee future results. Not investment advice.
      </p>
    </div>
  );
}
