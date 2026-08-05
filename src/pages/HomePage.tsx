import { useState } from "react";
import { Hero } from "@/components/home/Hero";
import { Marquee } from "@/components/home/Marquee";
import { AboutSection } from "@/components/home/AboutSection";
import { Testimonials } from "@/components/home/Testimonials";
import { FinalCTA } from "@/components/home/FinalCTA";
import { CategoryGrid } from "@/components/product/CategoryGrid";
import { ProductsSection } from "@/components/product/ProductsSection";

/* ============================================================
   HOME — montagem das seções da página inicial.
   activeCategory compartilhado: CategoryGrid e ProductsSection
   filtram a mesma vitrine.
   ============================================================ */

export default function HomePage() {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  return (
    <>
      <Hero />
      <Marquee />
      <CategoryGrid active={activeCategory} onSelect={setActiveCategory} />
      <ProductsSection activeCategory={activeCategory} onSelect={setActiveCategory} />
      <AboutSection />
      <Testimonials />
      <FinalCTA />
    </>
  );
}
