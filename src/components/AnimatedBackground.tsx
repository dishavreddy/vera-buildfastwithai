export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
      {/* Base gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(34, 211, 238, 0.06), transparent 70%), ' +
            'radial-gradient(ellipse 60% 40% at 50% 100%, rgba(52, 211, 153, 0.04), transparent 70%)',
        }}
      />

      {/* Floating blobs */}
      <div
        className="absolute rounded-full animate-blob-float"
        style={{
          width: 400,
          height: 400,
          top: '10%',
          left: '15%',
          background: 'radial-gradient(circle, rgba(34, 211, 238, 0.08), transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute rounded-full animate-blob-float-delayed"
        style={{
          width: 350,
          height: 350,
          bottom: '10%',
          right: '10%',
          background: 'radial-gradient(circle, rgba(52, 211, 153, 0.06), transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute rounded-full animate-blob-float"
        style={{
          width: 250,
          height: 250,
          top: '50%',
          left: '60%',
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.05), transparent 70%)',
          filter: 'blur(50px)',
          animationDelay: '10s',
        }}
      />
    </div>
  );
}
