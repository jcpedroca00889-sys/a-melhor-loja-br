import { useEffect, useState } from "react";

/* ============================================================
   TYPEWRITER — placeholder/efeito de digitação
   ============================================================ */

interface TypewriterOptions {
  typeSpeed?: number;
  deleteSpeed?: number;
  holdTime?: number;
}

export function useTypewriter(
  phrases: string[],
  opts: TypewriterOptions = {},
): { text: string; isTyping: boolean } {
  const { typeSpeed = 55, deleteSpeed = 30, holdTime = 1800 } = opts;
  const [index, setIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (phrases.length === 0) return;
    const current = phrases[index % phrases.length];
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (!deleting && text === current) {
      timeout = setTimeout(() => setDeleting(true), holdTime);
    } else if (deleting && text === "") {
      setDeleting(false);
      setIndex((i) => (i + 1) % phrases.length);
    } else {
      timeout = setTimeout(
        () => {
          setText(
            deleting
              ? current.slice(0, text.length - 1)
              : current.slice(0, text.length + 1),
          );
        },
        deleting ? deleteSpeed : typeSpeed,
      );
    }

    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [text, deleting, index, phrases, typeSpeed, deleteSpeed, holdTime]);

  return {
    text,
    isTyping: !deleting && text !== phrases[index % phrases.length],
  };
}
