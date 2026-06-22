// 事件总线类，用于组件间通信

// 为每种特定的事件定义具体的数据类型
export class EventDataTypes {
  // 指定特定事件的数据类型
  static readonly INIT_GAME_DATA: Object | null = null;
  static readonly GET_GAME_STATE: Object | null = null;
  static readonly GAME_STATE_RESULT: Object | null = null;
  static readonly GAME_OVER: Object | null = null;
  static readonly GAME_SCORE_UPDATE: Object | null = null;
  static readonly CONTINUE_GAME_ON_REMOTE: Object | null = null;
  static readonly SHOW_GAME_OVER_DIALOG: Object | null = null;
  static readonly BREAKPOINT_CHANGE: Object | null = null;
}

class EventBus {
  private static instance: EventBus;
  private listeners: Map<string, Array<(data: Object | null) => void>> = new Map();

  private constructor() {
    // 私有构造函数确保单例模式
  }

  /**
   * 获取EventBus的单例
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * 订阅事件
   * @param event 事件名称
   * @param callback 回调函数
   */
  public on<T extends Object | null = null>(event: string, callback: (data: T) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    // 类型转换确保类型兼容性
    this.listeners.get(event)?.push(callback as (data: Object | null) => void);
  }

  /**
   * 取消订阅事件
   * @param event 事件名称
   * @param callback 回调函数，如果不提供则移除所有该事件的监听器
   */
  public off<T extends Object | null = null>(event: string, callback?: (data: T) => void): void {
    if (!callback) {
      this.listeners.delete(event);
      return;
    }

    const callbacks = this.listeners.get(event);
    if (callbacks) {
      // 类型转换确保类型兼容性
      const typedCallback = callback as (data: Object | null) => void;
      const index = callbacks.indexOf(typedCallback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
      if (callbacks.length === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * 发布事件
   * @param event 事件名称
   * @param data 事件数据
   */
  public emit<T extends Object | null = null>(event: string, data?: T): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data as Object | null);
        } catch (error) {
          console.error(`Error in event ${event} callback:`, error);
        }
      });
    }
  }
}

// 定义事件常量
export enum EventTopic {
  INIT_GAME_DATA = 'initGameData',
  GET_GAME_STATE = 'getGameState',
  GAME_STATE_RESULT = 'gameStateResult',
  GAME_OVER = 'gameOver',
  GAME_SCORE_UPDATE = 'gameScoreUpdate',
  CONTINUE_GAME_ON_REMOTE = 'continueGameOnRemote',
  SHOW_GAME_OVER_DIALOG = 'showGameOverDialog',
  BREAKPOINT_CHANGE = 'breakpointChange'
}

export default EventBus.getInstance();