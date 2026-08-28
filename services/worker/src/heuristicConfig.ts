import type { ClipCategory } from "@llz-clipper/database";

export const CATEGORY_KEYWORDS: Record<ClipCategory, string[]> = {
  PLAY: ["que jogada", "consegui pegar", "olha essa jogada", "matei"],
  FUNNY: ["kkkk", "kkkkk", "mano do céu", "não acredito nisso"],
  REACTION: ["meu deus", "não pode ser", "sério isso", "gente"],
  FAIL: ["morri", "affs", "que ódio", "perdi"],
  CLUTCH: ["consegui", "vamos que vamos", "let's go", "isso aí"],
  SPOKEN_MOMENT: [],
  IMPORTANT_MOMENT: [],
};

export const KEYWORD_SCORE = 40;
export const ENERGY_BONUS = 30;
export const SCENE_BONUS = 15;
export const MAX_RAW_SCORE = KEYWORD_SCORE + ENERGY_BONUS + SCENE_BONUS;
export const SCENE_PROXIMITY_SEC = 2;
export const MIN_CLIP_SCORE = 20;
export const MIN_CLIP_DURATION_SEC = 15;
export const MAX_CLIP_DURATION_SEC = 90;
export const MAX_CLIPS_PER_VOD = 10;
export const ENERGY_PEAK_MULTIPLIER = 1.5;
