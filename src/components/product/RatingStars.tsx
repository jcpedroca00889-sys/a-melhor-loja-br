import { Star } from "lucide-react";

/* ============================================================
   RATING STARS — estrelas com preenchimento parcial + hover
   ============================================================ */

export function RatingStars({
  rating,
  size = 14,
  className = "",
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`group inline-flex items-center gap-0.5 transition-transform duration-300 hover:scale-110 ${className}`}
      title={`${rating.toFixed(1).replace(".", ",")} de 5`}
      aria-label={`Avaliação ${rating.toFixed(1)} de 5`}
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const fill = Math.max(0, Math.min(1, rating - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star
              className="absolute inset-0 text-white/15"
              style={{ width: size, height: size }}
            />
            <span
              className="absolute inset-0 overflow-hidden transition-opacity duration-300"
              style={{ width: `${fill * 100}%` }}
            >
              <Star
                className="fill-secondary text-secondary"
                style={{ width: size, height: size }}
              />
            </span>
          </span>
        );
      })}
    </div>
  );
}
