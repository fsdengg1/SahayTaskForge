export default function BrandLogo({ variant = 'color', compact = false, alt = 'Sahay Racks' }) {
  const src = variant === 'white' ? '/brand/logo-white.png' : '/brand/logo-color.jpg';
  return (
    <img
      src={src}
      alt={alt}
      className={`brand-logo is-${variant}${compact ? ' is-compact' : ''}`}
    />
  );
}
