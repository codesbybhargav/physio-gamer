export const GameMode = {
  SQUAT: 'SQUAT',
  ARM_RAISE: 'ARM_RAISE',
  LUNGE: 'LUNGE'
} as const;
export type GameMode = typeof GameMode[keyof typeof GameMode];

export const GameState = {
  MENU: 'MENU',
  TUTORIAL: 'TUTORIAL',
  PLAYING: 'PLAYING',
  GAME_OVER: 'GAME_OVER'
} as const;
export type GameState = typeof GameState[keyof typeof GameState];

export const Difficulty = {
  EASY: 'EASY',
  MEDIUM: 'MEDIUM',
  HARD: 'HARD'
} as const;
export type Difficulty = typeof Difficulty[keyof typeof Difficulty];

export interface Point {
  x: number;
  y: number;
  visibility?: number;
}

export interface GameStats {
  score: number;
  highScore: number;
  calories: number;
}