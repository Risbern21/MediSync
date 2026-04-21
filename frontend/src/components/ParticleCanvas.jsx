import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * Full-screen Three.js animated particle network.
 * Used as the auth page hero background.
 */
export default function ParticleCanvas({ style = {} }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    /* ─── Scene Setup ─── */
    const W = el.clientWidth;
    const H = el.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 1000);
    camera.position.z = 80;

    /* ─── Particles ─── */
    const COUNT = 260;
    const positions = new Float32Array(COUNT * 3);
    const velocities = [];

    for (let i = 0; i < COUNT; i++) {
      const x = (Math.random() - 0.5) * 160;
      const y = (Math.random() - 0.5) * 120;
      const z = (Math.random() - 0.5) * 60;
      positions[i * 3]     = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      velocities.push({
        x: (Math.random() - 0.5) * 0.08,
        y: (Math.random() - 0.5) * 0.06,
        z: 0,
      });
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.9,
      transparent: true,
      opacity: 0.55,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);

    /* ─── Connection Lines ─── */
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.12,
    });

    const MAX_DIST = 28;
    let lineGroup = buildLines(positions, COUNT, MAX_DIST, lineMat);
    scene.add(lineGroup);

    /* ─── Floating orbs (large blurred spheres) ─── */
    const orbGeo = new THREE.SphereGeometry(18, 32, 32);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0x93C5FD, transparent: true, opacity: 0.06 });
    const orb1 = new THREE.Mesh(orbGeo, orbMat);
    orb1.position.set(-40, 30, -30);
    scene.add(orb1);

    const orb2 = new THREE.Mesh(
      new THREE.SphereGeometry(22, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xA5B4FC, transparent: true, opacity: 0.05 })
    );
    orb2.position.set(50, -25, -40);
    scene.add(orb2);

    /* ─── Mouse influence ─── */
    const mouse = { x: 0, y: 0 };
    const onMouseMove = (e) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 40;
      mouse.y = -(e.clientY / window.innerHeight - 0.5) * 30;
    };
    window.addEventListener('mousemove', onMouseMove);

    /* ─── Resize ─── */
    const onResize = () => {
      const W2 = el.clientWidth;
      const H2 = el.clientHeight;
      camera.aspect = W2 / H2;
      camera.updateProjectionMatrix();
      renderer.setSize(W2, H2);
    };
    window.addEventListener('resize', onResize);

    /* ─── Animation loop ─── */
    let frame = 0;
    let animId;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      frame++;

      // Move particles
      const pos = geo.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        pos[i * 3]     += velocities[i].x;
        pos[i * 3 + 1] += velocities[i].y;
        // Wrap around
        if (pos[i * 3]     > 80)  pos[i * 3]     = -80;
        if (pos[i * 3]     < -80) pos[i * 3]     = 80;
        if (pos[i * 3 + 1] > 60)  pos[i * 3 + 1] = -60;
        if (pos[i * 3 + 1] < -60) pos[i * 3 + 1] = 60;
      }
      geo.attributes.position.needsUpdate = true;

      // Rebuild lines every 6 frames for perf
      if (frame % 6 === 0) {
        scene.remove(lineGroup);
        lineGroup.geometry.dispose();
        lineGroup = buildLines(pos, COUNT, MAX_DIST, lineMat);
        scene.add(lineGroup);
      }

      // Gentle camera parallax with mouse
      camera.position.x += (mouse.x * 0.12 - camera.position.x) * 0.03;
      camera.position.y += (mouse.y * 0.12 - camera.position.y) * 0.03;

      // Orb drift
      orb1.position.x = -40 + Math.sin(frame * 0.005) * 8;
      orb1.position.y = 30  + Math.cos(frame * 0.007) * 6;
      orb2.position.x = 50  + Math.cos(frame * 0.004) * 10;
      orb2.position.y = -25 + Math.sin(frame * 0.006) * 8;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={mountRef}
      style={{
        position: 'absolute', inset: 0, zIndex: 0,
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
}

function buildLines(pos, count, maxDist, mat) {
  const linePositions = [];
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const dx = pos[i * 3] - pos[j * 3];
      const dy = pos[i * 3 + 1] - pos[j * 3 + 1];
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < maxDist) {
        linePositions.push(
          pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2],
          pos[j * 3], pos[j * 3 + 1], pos[j * 3 + 2]
        );
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
  return new THREE.LineSegments(geo, mat);
}
