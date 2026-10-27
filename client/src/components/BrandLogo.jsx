export default function BrandLogo({ variant = 'color', compact = false, alt = 'Sahay Racks' }) {
  return (
    <span className={`brand-lockup is-${variant}${compact ? ' is-compact' : ''}`} role="img" aria-label={alt}>
      <span className="brand-mark" aria-hidden="true">SR</span>
      {!compact && (
        <span className="brand-copy">
          <strong>Sahay Racks</strong>
          <span>Project Tracking</span>
        </span>
      )}
    </span>
  );
}
