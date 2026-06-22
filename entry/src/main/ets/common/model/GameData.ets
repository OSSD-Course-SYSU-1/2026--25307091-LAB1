// 不再从WebViewPage导入GameState
// import { GameState } from "../../pages/WebViewPage";

export interface SnakeSegment {
  x: number;
  y: number;
}

export interface FoodPosition {
  x: number;
  y: number;
}

// 在这里定义GameState接口，作为统一的类型定义
export interface GameState {
  snake: SnakeSegment[];
  food: FoodPosition;
  direction: string;
  nextDirection: string;
  score: number;
  speed: number;
  gameStarted: boolean;
  gameOver: boolean;
  gamePaused: boolean;
  highScore: number;
  autoStart: boolean;
  boundaryCollision?: string; // 边界碰撞信息，表示碰撞的是哪个边界（left/right/top/bottom）
  entryBoundary?: string;  // 入口边界信息，表示从哪个边界进入（left/right/top/bottom）
  stateVersion?: number;   // 状态版本号，用于防止分布式数据回滚
}

export class GameData {
  snake: SnakeSegment[] = [];
  food: FoodPosition = { x: 0, y: 0 };
  direction: string = 'right';
  nextDirection: string = 'right';
  score: number = 0;
  speed: number = 250;
  gameStarted: boolean = false;
  gameOver: boolean = false;
  gamePaused: boolean = true; // 在接续时默认为暂停状态
  highScore: number = 0;
  autoStart: boolean = false;
  boundaryCollision?: string; // 边界碰撞信息
  entryBoundary?: string;  // 入口边界信息
  stateVersion?: number;   // 状态版本号

  constructor(gameState?: GameState) {

    if (gameState) {
      this.snake = gameState.snake || [];
      this.food = gameState.food || { x: 0, y: 0 };
      this.direction = gameState.direction || 'right';
      this.nextDirection = gameState.nextDirection || 'right';
      this.score = gameState.score || 0;
      this.speed = gameState.speed || 250;
      this.gameStarted = gameState.gameStarted || false;
      this.gameOver = gameState.gameOver || false;
      this.gamePaused = true; // 强制在接续时为暂停状态
      this.highScore = gameState.highScore || 0;
      this.autoStart = gameState.autoStart || false;
      this.boundaryCollision = gameState.boundaryCollision;
      this.entryBoundary = gameState.entryBoundary;
      this.stateVersion = gameState.stateVersion || 0;
    }
  }
}