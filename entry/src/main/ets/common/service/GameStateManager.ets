// 游戏状态管理服务，用于实时缓存游戏状态
import { GameData, GameState } from '../model/GameData';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0000;
const TAG = 'GameStateManager';

/**
 * 游戏状态管理器，单例模式
 * 维护实时游戏状态数据，供应用接续使用
 */
class GameStateManager {
  private static instance: GameStateManager;
  // 缓存最新的游戏状态
  private currentGameState: GameState | null = null;
  // 标记状态是否已经初始化
  private isInitialized: boolean = false;
  // 状态版本号，每次更新递增，防止分布式数据回滚
  private stateVersion: number = 0;

  private constructor() {
    // 私有构造函数，确保单例
  }

  /**
   * 获取GameStateManager的单例
   */
  public static getInstance(): GameStateManager {
    if (!GameStateManager.instance) {
      GameStateManager.instance = new GameStateManager();
    }
    return GameStateManager.instance;
  }

  /**
   * 更新当前游戏状态
   * @param gameState 新的游戏状态
   */
  public updateGameState(gameState: GameState): void {
    this.stateVersion++;
    gameState.stateVersion = this.stateVersion; // 注入版本号，防止分布式回滚
    this.currentGameState = gameState;
    this.isInitialized = true;
    hilog.info(DOMAIN, TAG, `游戏状态已更新, 版本: ${this.stateVersion}`);
  }

  /**
   * 获取当前游戏状态
   * @returns 当前游戏状态，如果未初始化则返回null
   */
  public getCurrentGameState(): GameState | null {
    return this.currentGameState;
  }

  /**
   * 检查游戏状态是否已初始化
   */
  public isGameStateInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * 创建GameData对象
   * 将当前游戏状态转换为GameData对象供接续使用
   */
  public createGameData(): GameData | null {
    if (!this.currentGameState) {
      return null;
    }
    return new GameData(this.currentGameState);
  }

  /**
   * 重置游戏状态
   */
  public resetGameState(): void {
    this.currentGameState = null;
    this.isInitialized = false;
    hilog.info(DOMAIN, TAG, '游戏状态已重置');
  }
}

export default GameStateManager.getInstance();