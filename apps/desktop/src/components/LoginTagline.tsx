import { useEffect, useState } from "react";

export const TAGLINES = [
  "TRANSFORME VODS EM CLIPES VIRAIS",
  "DETECÇÃO AUTOMÁTICA DOS MELHORES MOMENTOS",
  "CORTE, ZOOM, LEGENDA E MÚSICA",
  "RENDER PROFISSIONAL EM POUCOS CLIQUES",
  "DA LIVE AO CLIPE PRONTO PRA POSTAR",
  "IA QUE ENTENDE SEU MELHOR MOMENTO",
  "FEITO PRA QUEM VIVE DE STREAMING",
];

const ROTATE_INTERVAL_MS = 3000;

export function LoginTagline() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % TAGLINES.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="login-tagline">
      <span key={index} className="login-tagline-text">
        {TAGLINES[index]}
      </span>
    </div>
  );
}
