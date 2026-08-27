interface ComingSoonPageProps {
  title: string;
}

export function ComingSoonPage({ title }: ComingSoonPageProps) {
  return (
    <div className="coming-soon">
      <h1>{title}</h1>
      <p>Essa funcionalidade chega em uma próxima fase do LLZ CLIPPER.</p>
    </div>
  );
}
