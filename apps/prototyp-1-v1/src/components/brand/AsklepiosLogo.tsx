import logoUrl from '@/assets/asklepios-logo.png';

export function AsklepiosLogo({
  className = '',
  alt = 'Askelpios',
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <img
      src={logoUrl}
      alt={alt}
      className={className}
      loading="eager"
      decoding="async"
      draggable={false}
    />
  );
}

