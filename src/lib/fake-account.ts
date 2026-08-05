/* ============================================================
   FAKE ACCOUNT — gerador de credenciais fictícias para entrega
   de pedidos no AdminPage (loja de contas de streaming).
   Dados 100% inventados: o admin preenche a mensagem de entrega
   com uma conta plausível para o cliente.
   ============================================================ */

interface Platform {
  key: string;
  label: string;
  emailPrefix: string;
  aliases: string[];
}

const PLATFORMS: Platform[] = [
  { key: "netflix", label: "Netflix", emailPrefix: "netflix", aliases: ["netflix"] },
  { key: "spotify", label: "Spotify", emailPrefix: "spotify", aliases: ["spotify"] },
  {
    key: "amazon",
    label: "Amazon Prime",
    emailPrefix: "prime",
    aliases: ["amazon", "prime video", "prime"],
  },
  { key: "disney", label: "Disney+", emailPrefix: "disney", aliases: ["disney"] },
  { key: "hbo", label: "HBO Max", emailPrefix: "hbomax", aliases: ["hbo", "max"] },
  {
    key: "youtube",
    label: "YouTube Premium",
    emailPrefix: "youtube",
    aliases: ["youtube", "yt"],
  },
  { key: "crunchyroll", label: "Crunchyroll", emailPrefix: "crunchyroll", aliases: ["crunchyroll"] },
];

const FALLBACK: Platform = {
  key: "streaming",
  label: "Streaming",
  emailPrefix: "streaming",
  aliases: [],
};

/** Normaliza: minúsculas e sem acentos (netflix, disney+, hbo max…) */
const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Identifica a plataforma a partir do nome do produto (ex. "Netflix 1 Mês") */
export function detectPlatform(productName: string | undefined): Platform {
  const raw = normalize(productName ?? "");
  for (const p of PLATFORMS) {
    if (p.aliases.some((a) => raw.includes(a))) return p;
  }
  return FALLBACK;
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("");
const LOWER = "abcdefghijkmnopqrstuvwxyz".split("");
const DIGITS = "23456789".split("");
const SYMBOLS = "!@#$%&*?".split("");

const randomToken = (length: number): string =>
  Array.from({ length }, () => pick(CHARS)).join("");

/** Senha de 8 caracteres tipo "Lk#9xQ2m" (maiúscula + minúscula + número + símbolo) */
const randomPassword = (length = 8): string => {
  const all = [...UPPER, ...LOWER, ...DIGITS, ...SYMBOLS];

  const parts = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (parts.length < length) parts.push(pick(all));

  return parts
    .map((c) => ({ c, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.c)
    .join("");
};

export interface FakeAccount {
  platform: string;
  email: string;
  password: string;
  message: string;
}

/** Monta a mensagem de entrega com credenciais fictícias plausíveis */
export function generateFakeAccount(
  productName: string | undefined,
  customerName: string,
): FakeAccount {
  const platform = detectPlatform(productName);
  const email = `${platform.emailPrefix}.${randomToken(6)}@gmail.com`;
  const password = randomPassword(8);
  const profile = customerName.trim() || "Cliente";

  const message = [
    `Olá ${profile}! 🎉`,
    `Sua conta ${platform.label} está pronta:`,
    `• E-mail: ${email}`,
    `• Senha: ${password}`,
    `• Perfil: ${profile}`,
    `Acesse agora e aproveite! Qualquer dúvida, estamos à disposição. 😊`,
  ].join("\n");

  return { platform: platform.label, email, password, message };
}
