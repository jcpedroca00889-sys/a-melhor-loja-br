/* ============================================================
   VERCEL SERVERLESS — entrada da API.
   A Vercel executa o Express inteiro como UMA função em /api
   (rewrite em vercel.json: "/api/:path*" → "/api").
   ============================================================ */
import type { Request, Response } from "express";
import app from "../server/index.ts";

export default function handler(req: Request, res: Response) {
  // Defensivo: em rewrites da Vercel a função pode receber o caminho reescrito
  // (/api) em vez do original. Se for o caso, restauramos o caminho real via
  // header x-vercel-rewrite para o Express rotear corretamente. Quando a Vercel
  // já entrega o caminho original (comportamento padrão), nada é alterado.
  const received = (req.url ?? "").split("?")[0];
  if (received === "/api" || received === "/api/") {
    const original = req.headers["x-vercel-rewrite"];
    if (typeof original === "string" && original.startsWith("/api")) {
      const u = new URL(original, "http://vercel.local");
      req.url = u.pathname + u.search;
    }
  }
  return app(req, res);
}
