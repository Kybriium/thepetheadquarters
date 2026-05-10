"use client";

import { useEffect, useRef } from "react";

export function HeroBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Defer GSAP off the critical path. Orbs render at opacity 0 (inline style)
    // until the animation library has loaded, so there's no flash.
    let cancelled = false;
    const orbs = containerRef.current.querySelectorAll<HTMLDivElement>("[data-orb]");

    import("gsap").then(({ default: gsap }) => {
      if (cancelled) return;

      orbs.forEach((orb, i) => {
        gsap.set(orb, { opacity: 0 });

        gsap.to(orb, {
          opacity: 1,
          duration: 2.5,
          delay: i * 0.4,
          ease: "power2.out",
        });

        gsap.to(orb, {
          x: `random(-150, 150)`,
          y: `random(-100, 100)`,
          duration: `random(6, 10)`,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: i * 0.5,
        });

        gsap.to(orb, {
          scale: `random(0.5, 1.5)`,
          duration: `random(5, 8)`,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          delay: i * 0.7,
        });
      });
    });

    return () => {
      cancelled = true;
      // Best-effort cleanup — only runs if gsap finished loading.
      import("gsap").then(({ default: gsap }) => {
        orbs.forEach((orb) => gsap.killTweensOf(orb));
      });
    };
  }, []);

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Large gold orb — top right */}
      <div
        data-orb
        className="absolute"
        style={{
          top: "5%",
          right: "10%",
          width: "clamp(350px, 50vw, 700px)",
          height: "clamp(350px, 50vw, 700px)",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(187,148,41,0.18) 0%, rgba(187,148,41,0.05) 40%, transparent 70%)",
          filter: "blur(40px)",
          opacity: 0,
        }}
      />

      {/* Medium orb — left */}
      <div
        data-orb
        className="absolute"
        style={{
          top: "25%",
          left: "0%",
          width: "clamp(250px, 35vw, 500px)",
          height: "clamp(250px, 35vw, 500px)",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(187,148,41,0.12) 0%, rgba(187,148,41,0.03) 50%, transparent 70%)",
          filter: "blur(35px)",
          opacity: 0,
        }}
      />

      {/* Small accent orb — center bottom */}
      <div
        data-orb
        className="absolute"
        style={{
          bottom: "25%",
          left: "35%",
          width: "clamp(200px, 25vw, 400px)",
          height: "clamp(200px, 25vw, 400px)",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(187,148,41,0.10) 0%, transparent 60%)",
          filter: "blur(45px)",
          opacity: 0,
        }}
      />

      {/* Warm accent — top left corner */}
      <div
        data-orb
        className="absolute"
        style={{
          top: "-5%",
          left: "20%",
          width: "clamp(150px, 20vw, 300px)",
          height: "clamp(150px, 20vw, 300px)",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(187,148,41,0.15) 0%, transparent 60%)",
          filter: "blur(30px)",
          opacity: 0,
        }}
      />

      {/* Fade to black at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: "35%",
          background: "linear-gradient(to bottom, transparent 0%, var(--bg-primary) 100%)",
        }}
      />
    </div>
  );
}
