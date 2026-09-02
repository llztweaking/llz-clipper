import { useRef, useState, type MouseEvent } from "react";

const PARTICLE_COUNT = 14;
const PARTICLE_COLORS = ["var(--accent-start)", "var(--accent-mid)", "var(--accent-end)"];

interface Particle {
  left: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
}

function generateParticles(): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    left: Math.random() * 100,
    size: 3 + Math.random() * 3,
    duration: 5 + Math.random() * 4,
    delay: Math.random() * 6,
    color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
  }));
}

export function LoginBackground() {
  const [particles] = useState(generateParticles);
  const glowRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement>(null);

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const relX = (event.clientX - rect.left) / rect.width - 0.5;
    const relY = (event.clientY - rect.top) / rect.height - 0.5;
    if (particlesRef.current) particlesRef.current.style.transform = `translate(${relX * 30}px, ${relY * 30}px)`;
    if (glowRef.current) glowRef.current.style.transform = `translate(${relX * 16}px, ${relY * 16}px)`;
  }

  function handleMouseLeave() {
    if (particlesRef.current) particlesRef.current.style.transform = "translate(0, 0)";
    if (glowRef.current) glowRef.current.style.transform = "translate(0, 0)";
  }

  return (
    <div className="login-background" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} aria-hidden="true">
      <div className="login-glow" ref={glowRef} />
      <div className="login-particles" ref={particlesRef}>
        {particles.map((particle, index) => (
          <span
            key={index}
            className="login-particle"
            style={{
              left: `${particle.left}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              background: particle.color,
              boxShadow: `0 0 8px ${particle.color}`,
              animationDuration: `${particle.duration}s`,
              animationDelay: `${particle.delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
