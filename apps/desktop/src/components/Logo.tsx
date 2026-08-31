interface LogoProps {
  size?: "sm" | "lg";
}

export function Logo({ size = "sm" }: LogoProps) {
  const iconSize = size === "lg" ? 40 : 22;
  const fontSize = size === "lg" ? 28 : 16;
  const gradientId = `logo-gradient-${size}`;

  return (
    <span className="app-logo">
      <svg width={iconSize} height={iconSize} viewBox="0 0 40 40" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ff2ec4" />
            <stop offset="50%" stopColor="#7c3bff" />
            <stop offset="100%" stopColor="#3b8bff" />
          </linearGradient>
        </defs>
        <path d="M8 6 L8 34 L32 20 Z" fill={`url(#${gradientId})`} />
      </svg>
      <span className="app-logo-text" style={{ fontSize }}>
        LLZ<span className="app-logo-text-accent">CLIPPER</span>
      </span>
    </span>
  );
}
