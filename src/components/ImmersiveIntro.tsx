"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere, MeshDistortMaterial } from "@react-three/drei";
import * as THREE from "three";

// 3Dパーティクルシステム
function ParticleField({ count = 200 }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const particles = useRef<THREE.Vector3[]>([]);

  useEffect(() => {
    if (!meshRef.current) return;

    // パーティクルの初期位置を設定
    for (let i = 0; i < count; i++) {
      particles.current[i] = new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20
      );
      meshRef.current.setMatrixAt(i, new THREE.Matrix4().setPosition(particles.current[i]));
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [count]);

  useFrame((state) => {
    if (!meshRef.current || !particles.current.length) return;

    const time = state.clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const particle = particles.current[i];
      if (particle) {
        particle.y += Math.sin(time + i) * 0.01;
        particle.x += Math.cos(time * 0.5 + i) * 0.005;
        meshRef.current.setMatrixAt(i, new THREE.Matrix4().setPosition(particle));
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.02]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
    </instancedMesh>
  );
}

// メインの3Dオブジェクト
function AnimatedSphere() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.getElapsedTime();
    meshRef.current.rotation.x = time * 0.2;
    meshRef.current.rotation.y = time * 0.3;
    meshRef.current.position.y = Math.sin(time) * 0.5;
  });

  return (
    <Sphere ref={meshRef} args={[1, 32, 32]}>
      <MeshDistortMaterial
        color="#3b82f6"
        attach="material"
        distort={0.3}
        speed={2}
        roughness={0}
        metalness={0.5}
        transparent
        opacity={0.8}
      />
    </Sphere>
  );
}

interface ImmersiveIntroProps {
  title: string;
  subtitle: string;
  onComplete: () => void;
  onProgressComplete?: () => void;
}

export function ImmersiveIntro({ title, subtitle, onComplete, onProgressComplete }: ImmersiveIntroProps) {
  const [phase, setPhase] = useState(0); // 0: 3D表示, 1: タイトル表示, 2: フェードアウト
  const [showTitle, setShowTitle] = useState(false);
  const [progressComplete, setProgressComplete] = useState(false);
  const titleLetters = Array.from(title);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [dpr, setDpr] = useState<[number, number] | number>([1, 1.5]);
  const [particleCount, setParticleCount] = useState(300);

  useEffect(() => {
    // Respect prefers-reduced-motion and lower devicePixelRatio on low-power devices
    try {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReducedMotion(mq.matches);
      const onChange = () => setReducedMotion(mq.matches);
      mq.addEventListener?.("change", onChange);
      // Tune DPR
      const maxDpr = Math.min(1.5, window.devicePixelRatio || 1);
      setDpr([1, maxDpr]);
      // Tune particle count for mobile
      const isMobile = window.matchMedia("(max-width: 640px)").matches;
      setParticleCount(isMobile ? 120 : 240);
      return () => mq.removeEventListener?.("change", onChange);
    } catch {}
  }, []);

  useEffect(() => {
    const timeline = [
      { delay: 0, action: () => setPhase(0) },           // 3Dシーン開始
      { delay: 400, action: () => setPhase(1) },         // タイトル表示開始（さらに短縮）
      { delay: 900, action: () => setShowTitle(true) },  // 文字アニメーション開始（さらに短縮）
      { delay: 3500, action: () => {                      // プログレスバー完了を短縮
        setProgressComplete(true);
        if (onProgressComplete) {
          onProgressComplete();
        }
      }},
      { delay: 4200, action: () => setPhase(2) },        // フェードアウト開始（早め）
      { delay: 4800, action: () => onComplete() },       // 完了（全体短縮）
    ];

    timeline.forEach(({ delay, action }) => {
      setTimeout(action, delay);
    });
  }, [onComplete, onProgressComplete]);

  return (
    <AnimatePresence>
      {phase < 2 && (
        <motion.div
          className="fixed inset-0 z-[9999] bg-black flex items-center justify-center overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 1, ease: "easeInOut" }}
          style={{ backgroundColor: '#000000' }}
        >
          {/* 3D背景 */}
          <div className="absolute inset-0">
            <Canvas
              camera={{ position: [0, 0, 5], fov: 75 }}
              dpr={dpr}
              performance={{ min: 0.6 }}
              gl={{ powerPreference: "low-power", antialias: false }}
              frameloop={reducedMotion ? "never" : "always"}
              shadows={false}
            >
              <ambientLight intensity={0.5} />
              <pointLight position={[10, 10, 10]} intensity={1} />
              <pointLight position={[-10, -10, -10]} intensity={0.5} color="#8b5cf6" />
              {!reducedMotion && <AnimatedSphere />}
              {!reducedMotion && <ParticleField count={particleCount} />}
            </Canvas>
          </div>

          {/* 完全な黒い背景オーバーレイ */}
          <div className="absolute inset-0 bg-black" />

          {/* グラデーションオーバーレイ */}
          <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-transparent to-black/50" />

          {/* タイトル表示 */}
          <motion.div
            className="relative z-10 text-center"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{
              opacity: phase >= 1 && !progressComplete ? 1 : 0,
              scale: phase >= 1 && !progressComplete ? 1 : 0.8
            }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          >
            {/* メインタイトル */}
            <div className="mb-8">
              <div className="text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-bold tracking-wider relative">
                {titleLetters.map((letter, i) => (
                  <motion.span
                    key={i}
                    className="inline-block"
                    initial={{
                      opacity: 0,
                      y: 100,
                      rotateX: 90,
                      scale: 0
                    }}
                    animate={showTitle && !progressComplete ? {
                      opacity: 1,
                      y: 0,
                      rotateX: 0,
                      scale: 1
                    } : {}}
                    transition={{
                      duration: 1.2,
                      delay: i * 0.1,
                      ease: "easeOut"
                    }}
                    style={{
                      background: "linear-gradient(135deg, #ffffff 0%, #3b82f6 50%, #8b5cf6 100%)",
                      backgroundClip: "text",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      transformStyle: "preserve-3d"
                    }}
                  >
                    {letter === " " ? "\u00A0" : letter}
                  </motion.span>
                ))}
              </div>

              {/* タイトルグロー効果 */}
              <motion.div
                className="absolute inset-0 blur-3xl opacity-20"
                style={{
                  background: "radial-gradient(circle, rgba(59,130,246,0.3) 0%, rgba(139,92,246,0.2) 50%, transparent 70%)"
                }}
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.2, 0.4, 0.2]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </div>

            {/* サブタイトル */}
            <motion.div
              className="text-xl sm:text-2xl md:text-3xl text-white/90 font-light tracking-wide"
              initial={{ opacity: 0, y: 30 }}
              animate={showTitle ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 1.2, duration: 0.8 }}
            >
              <motion.span
                animate={{
                  opacity: progressComplete ? 0 : 1,
                  y: progressComplete ? 20 : 0
                }}
                transition={{
                  duration: 1,
                  ease: "easeOut"
                }}
              >
                {subtitle}
              </motion.span>
            </motion.div>

            {/* プログレスバー */}
            <motion.div
              className="mt-12 w-64 h-1 bg-white/20 rounded-full overflow-hidden mx-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: phase >= 1 ? 1 : 0 }}
              transition={{ delay: 0.8 }}
            >
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 3, delay: 0.8, ease: "linear" }}
              />
            </motion.div>
          </motion.div>

          {/* 背景パーティクル */}
          <div className="absolute inset-0 pointer-events-none">
            {!reducedMotion && [...Array(30)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-white/30 rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
                animate={{
                  y: [-20, 20, -20],
                  opacity: [0.3, 1, 0.3],
                  scale: [0.5, 1.5, 0.5],
                }}
                transition={{
                  duration: 4 + Math.random() * 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: Math.random() * 2,
                }}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
