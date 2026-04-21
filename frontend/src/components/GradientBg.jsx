import { useEffect, useRef } from 'react';

/**
 * Animated CSS gradient orb background — subtle, premium.
 * Pure CSS + JS — no Three.js overhead needed for this one.
 */
export default function GradientBg() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let W, H;

    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const orbs = [
      { x: 0.15, y: 0.2,  r: 0.38, color: [99, 179, 237, 0.07],  dx: 0.00015, dy: 0.00010 },
      { x: 0.80, y: 0.15, r: 0.32, color: [139, 92, 246, 0.06],   dx: -0.00012, dy: 0.00018 },
      { x: 0.50, y: 0.75, r: 0.42, color: [59, 130, 246, 0.065],  dx: 0.00008, dy: -0.00015 },
      { x: 0.92, y: 0.65, r: 0.28, color: [236, 201, 75, 0.04],   dx: -0.00018, dy: -0.00009 },
    ];

    let t = 0;
    const draw = () => {
      animId = requestAnimationFrame(draw);
      t++;

      ctx.clearRect(0, 0, W, H);

      // Base bg
      ctx.fillStyle = '#F0F4FB';
      ctx.fillRect(0, 0, W, H);

      for (const orb of orbs) {
        // Slow drift
        orb.x += orb.dx + Math.sin(t * 0.001 + orb.r) * 0.00008;
        orb.y += orb.dy + Math.cos(t * 0.0013 + orb.r) * 0.00006;
        if (orb.x < -0.2) orb.dx = Math.abs(orb.dx);
        if (orb.x > 1.2)  orb.dx = -Math.abs(orb.dx);
        if (orb.y < -0.2) orb.dy = Math.abs(orb.dy);
        if (orb.y > 1.2)  orb.dy = -Math.abs(orb.dy);

        const cx = orb.x * W;
        const cy = orb.y * H;
        const radius = orb.r * Math.max(W, H);
        const [r, g, b, a] = orb.color;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, `rgba(${r},${g},${b},${a})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        width: '100vw',
        height: '100vh',
      }}
    />
  );
}
