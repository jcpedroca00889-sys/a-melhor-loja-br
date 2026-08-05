import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/* ============================================================
   HERO 3D — detalhe leve R3F: formas flutuantes cartoon
   (torus + esfera + icosaedro), material emissivo, parallax mouse
   ============================================================ */

interface FloatProps {
  position: [number, number, number];
  speed: number;
  amp: number;
  children: React.ReactNode;
}

function FloatingGroup({ position, speed, amp, children }: FloatProps) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ref.current) {
      ref.current.position.y = position[1] + Math.sin(t * speed) * amp;
      ref.current.rotation.y = t * speed * 0.25;
      ref.current.rotation.x = t * speed * 0.15;
    }
  });
  return (
    <group ref={ref} position={position}>
      {children}
    </group>
  );
}

function Rig({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state, delta) => {
    if (ref.current) {
      ref.current.rotation.y = THREE.MathUtils.lerp(
        ref.current.rotation.y,
        state.pointer.x * 0.4,
        Math.min(delta * 2.5, 1),
      );
      ref.current.rotation.x = THREE.MathUtils.lerp(
        ref.current.rotation.x,
        -state.pointer.y * 0.3,
        Math.min(delta * 2.5, 1),
      );
    }
  });
  return <group ref={ref}>{children}</group>;
}

export function Hero3D() {
  return (
    <div className="relative hidden lg:block" aria-hidden>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 8], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 6, 5]} intensity={1.6} />
        <pointLight position={[-4, -2, 3]} intensity={30} color="#FF8A00" />

        <Rig>
          {/* Torus principal */}
          <FloatingGroup position={[0, 0.4, 0]} speed={0.9} amp={0.22}>
            <mesh>
              <torusGeometry args={[1.55, 0.42, 24, 64]} />
              <meshStandardMaterial
                color="#FF8A00"
                roughness={0.25}
                metalness={0.35}
                emissive="#FF8A00"
                emissiveIntensity={0.18}
              />
            </mesh>
          </FloatingGroup>

          {/* Esfera amarela */}
          <FloatingGroup position={[2.4, 1.4, -0.6]} speed={1.25} amp={0.3}>
            <mesh>
              <sphereGeometry args={[0.42, 32, 32]} />
              <meshStandardMaterial
                color="#FFC83D"
                roughness={0.3}
                metalness={0.2}
                emissive="#FFC83D"
                emissiveIntensity={0.22}
              />
            </mesh>
          </FloatingGroup>

          {/* Icosaedro laranja pequeno */}
          <FloatingGroup position={[-2.3, -1.2, -0.8]} speed={1.05} amp={0.26}>
            <mesh>
              <icosahedronGeometry args={[0.5, 0]} />
              <meshStandardMaterial
                color="#FF8A00"
                flatShading
                roughness={0.4}
                emissive="#FF8A00"
                emissiveIntensity={0.15}
              />
            </mesh>
          </FloatingGroup>

          {/* Esfera branca de brilho */}
          <FloatingGroup position={[-1.6, 1.7, -1.2]} speed={1.5} amp={0.2}>
            <mesh>
              <sphereGeometry args={[0.22, 24, 24]} />
              <meshStandardMaterial
                color="#FFFFFF"
                roughness={0.1}
                metalness={0.1}
                emissive="#FFFFFF"
                emissiveIntensity={0.5}
              />
            </mesh>
          </FloatingGroup>

          {/* Anel fino */}
          <FloatingGroup position={[1.8, -1.5, -0.4]} speed={0.8} amp={0.28}>
            <mesh>
              <torusGeometry args={[0.7, 0.08, 16, 48]} />
              <meshStandardMaterial
                color="#FFC83D"
                roughness={0.35}
                emissive="#FFC83D"
                emissiveIntensity={0.2}
              />
            </mesh>
          </FloatingGroup>
        </Rig>
      </Canvas>
    </div>
  );
}
