// Lightweight profanity / strong-language detector shared by AI responses
// and the compliance report. Deterministic wordlist match so results are
// stable across clients and server passes.

const STRONG_WORDS = [
  "fuck", "fucking", "fucked", "shit", "shitty", "bullshit", "bitch",
  "bastard", "damn", "damned", "asshole", "arse", "arsehole", "dick",
  "piss", "pissed", "crap", "cunt", "wanker", "prick", "twat", "bloody",
  "slut", "whore", "moron", "idiot", "stupid", "dumb", "retard", "retarded",
  "screw you", "shut up", "hell no", "goddamn", "motherfucker", "mf",
];

const NORMALIZE_MAP: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a",
  "$": "s", "!": "i", "*": "", ".": "", "-": "", "_": "",
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((c) => NORMALIZE_MAP[c] ?? c)
    .join("");
}

export function detectStrongLanguage(text: string): { flagged: boolean; matches: string[] } {
  if (!text) return { flagged: false, matches: [] };
  const norm = normalize(text);
  const matches: string[] = [];
  for (const w of STRONG_WORDS) {
    const pattern = new RegExp(`\\b${w.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (pattern.test(norm)) matches.push(w);
  }
  return { flagged: matches.length > 0, matches };
}

export const STRONG_LANGUAGE_ADVISORY =
  "Please note: We ask that all communication remains respectful and professional. Strong or offensive language makes it harder for our team to help you effectively — kindly rephrase any future messages without it.";
