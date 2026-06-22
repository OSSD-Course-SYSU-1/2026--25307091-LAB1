import { AbilityConstant, Caller, common, Configuration, ConfigurationConstant, UIAbility, Want } from '@kit.AbilityKit';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { promptAction, window } from '@kit.ArkUI';
import { GameData, SnakeSegment, FoodPosition, GameState } from '../common/model/GameData';
import EventBus, { EventTopic } from '../common/service/EventBus';
import GameStateManager from '../common/service/GameStateManager';


import { systemShare, harmonyShare } from '@kit.ShareKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { url } from '@kit.ArkTS';
import { distributedDataObject } from '@kit.ArkData';
import { distributedDeviceManager } from '@kit.DistributedServiceKit';

// 定义游戏结束事件数据接口
interface GameOverEvent {
  score: number;
  gameState?: GameState;
  boundaryCollision?: string; // 添加边界碰撞信息字段，表示碰撞的是哪个边界（left/right/top/bottom）
}

// 断点信息接口
interface BreakpointInfo {
  breakpoint: string;
  width: number;
  height: number;
  orientation: string;
}

const DOMAIN = 0x0000;
const TAG = 'EntryAbility';

let distributedSessionId: string;
let continueSessionId: string | undefined;
let caller: Caller | undefined;
let gameDataObject: distributedDataObject.DataObject | undefined;

let continueGameDataObject: distributedDataObject.DataObject | undefined;
let lastProcessedGameData: string = ''; // 添加防重复处理的变量
let lastProcessedVersion: number = 0;     // 记录已处理的最高版本号，防止状态回滚

class RestoredGameData {
  gameData: string | undefined;
  constructor(gameData: string | undefined) {
    this.gameData = gameData;
  }
}

interface DistributedGameStateData {
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
  boundaryCollision: string | undefined;
  entryBoundary: string | undefined;
  stateVersion: number;
  receivedAt: number;
}

export default class EntryAbility extends UIAbility {
  onCreate(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    this.context.getApplicationContext().setColorMode(ConfigurationConstant.ColorMode.COLOR_MODE_NOT_SET);
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onCreate');
    
    // 初始化AppStorage
    AppStorage.SetOrCreate('restoredGameData', null);
    
    // 碰一碰分享处理逻辑
    let uri = want?.uri 
    if (uri) {
      let urlObject = url.URL.parseURL(want?.uri);
      hilog.info(DOMAIN, TAG, `解析的URL: ${JSON.stringify(urlObject)}`);
      let gameDataString = urlObject.params.get('data')
      hilog.info(DOMAIN, TAG, gameDataString);
      // parse gameDataString to GameData
      if (gameDataString) {
        try {
          const gameData = JSON.parse(gameDataString) as GameData;
          // 将游戏数据存入AppStorage，供WebViewPage使用
          AppStorage.SetOrCreate('restoredGameData', gameData);
          // 通过EventBus发送初始化游戏数据的事件
          EventBus.emit(EventTopic.INIT_GAME_DATA, gameData);
          hilog.info(DOMAIN, TAG, `已通过碰一碰分享发送初始化游戏状态事件`);
        } catch (error) {
          hilog.error(DOMAIN, TAG, `解析游戏数据失败: ${JSON.stringify(error)}`);
        }
      }
    }
    // 1.已配置快速拉起功能，应用立即启动时触发应用生命周期回调
    if (launchParam.launchReason === AbilityConstant.LaunchReason.PREPARE_CONTINUATION) {
      //若应用迁移数据较大，可在此处添加加载页面(页面中显示loading等)
      //可处理应用自定义跳转、时序等问题
      hilog.info(DOMAIN, TAG, '应用接续快速拉起功能');
    }
    // 添加游戏结束事件监听，用于触发跨设备接续
    EventBus.on(EventTopic.GAME_OVER, (data: GameOverEvent) => {
      hilog.info(DOMAIN, TAG, `收到游戏结束事件，分数: ${data.score}，边界碰撞: ${data.boundaryCollision || 'none'}`);
      
      // 如果是边界碰撞，需要先检查是否有可用设备
      if (data.boundaryCollision) {
        hilog.info(DOMAIN, TAG, `检测到边界碰撞: ${data.boundaryCollision}，检查是否有可用设备`);
        
        // 如果有游戏状态数据，使用统一的转换方法处理
        if (data.gameState) {
          // 统一在transformGameOverData中处理所有数据转换逻辑
          const modifiedGameState = this.transformGameOverData(data.gameState, data.boundaryCollision);
          hilog.info(DOMAIN, TAG, `已设置入口边界为: ${modifiedGameState.entryBoundary}`);
          
          // 将修改后的游戏状态存储到AppStorage
          AppStorage.SetOrCreate('latestGameState', modifiedGameState);
        }
        
        // 检查现有连接并尝试使用分布式流转
        this.handleBoundaryCollisionFlow();
      } else {
        // 非边界碰撞导致的游戏结束，正常处理
        hilog.info(DOMAIN, TAG, '非边界碰撞导致的游戏结束，正常处理');
        
        // 如果有游戏状态数据，也使用统一的转换方法处理（不传入边界碰撞参数）
        if (data.gameState) {
          hilog.info(DOMAIN, TAG, '收到游戏状态数据，已保存供分布式数据同步使用');
          // 将游戏状态数据存储到AppStorage，供分布式数据同步使用
          AppStorage.SetOrCreate('latestGameState', this.transformGameOverData(data.gameState));
        }
        
        // 非边界碰撞的游戏结束，显示游戏结束弹窗
        this.notifyShowGameOverDialog();
      }
    });
    // 接续
    if (launchParam.launchReason == AbilityConstant.LaunchReason.CONTINUATION) {
      if (want.parameters && want.parameters.continueSessionId) {
        this.restoreContinuationGameDataObject(want);
      }
    } else if (want.parameters && want.parameters.distributedSessionId) {
      // 跨设备分布式数据同步
      hilog.info(DOMAIN, TAG, '跨设备分布式数据同步，创建分布式数据对象');
      // 3.1 创建分布式数据对象实例
      let data = new RestoredGameData(undefined);
      try {
        gameDataObject = distributedDataObject.create(this.context, data);
      } catch (error) {
        hilog.error(DOMAIN, TAG, `创建分布式数据对象失败（模拟器可能不支持）: ${JSON.stringify(error)}`);
        gameDataObject = undefined;
      }

      if (gameDataObject) {
        // 3.2 注册数据变更监听
        gameDataObject.on('change', (sessionId: string, fields: Array<string>) => {
          hilog.info(DOMAIN, TAG, `分布式数据对象变更，sessionId: ${sessionId}, fields: ${JSON.stringify(fields)}`);

          // 检查是否有 gameData 字段更新
          if (fields.includes('gameData')) {
            const gameDataString = gameDataObject!['gameData'] as string;
            if (gameDataString && gameDataString !== lastProcessedGameData) {
              hilog.info(DOMAIN, TAG, `收到分布式游戏数据: ${gameDataString}`);
              lastProcessedGameData = gameDataString; // 记录已处理的数据
              
              try {
                const gameData = JSON.parse(gameDataString) as GameData;
                
                // 版本号校验：忽略低版本数据，防止分布式状态回滚
                const incomingVersion = gameData.stateVersion || 0;
                if (incomingVersion > 0 && incomingVersion <= lastProcessedVersion) {
                  hilog.info(DOMAIN, TAG, `忽略低版本数据: 收到=${incomingVersion}, 当前=${lastProcessedVersion}`);
                  return; // 跳过后续处理
                }
                lastProcessedVersion = incomingVersion;
                
                // 添加接收时间戳，避免重复处理
                // 手动创建新对象，避免使用Object.assign()
                const dataWithTimestamp: DistributedGameStateData = {
                  snake: gameData.snake,
                  food: gameData.food,
                  direction: gameData.direction,
                  nextDirection: gameData.nextDirection,
                  score: gameData.score,
                  speed: gameData.speed,
                  gameStarted: gameData.gameStarted,
                  gameOver: gameData.gameOver,
                  gamePaused: gameData.gamePaused,
                  highScore: gameData.highScore,
                  autoStart: gameData.autoStart,
                  boundaryCollision: gameData.boundaryCollision,
                  entryBoundary: gameData.entryBoundary,
                  stateVersion: gameData.stateVersion || 0,
                  receivedAt: Date.now()
                };
                
                // 将游戏数据存入AppStorage，供WebViewPage使用
                AppStorage.SetOrCreate('restoredGameData', dataWithTimestamp);
                // 通过EventBus发送初始化游戏数据的事件
                EventBus.emit(EventTopic.INIT_GAME_DATA, dataWithTimestamp);
                hilog.info(DOMAIN, TAG, `已通过事件总线发送初始化游戏状态事件，时间戳: ${dataWithTimestamp.receivedAt}`);
              } catch (error) {
                hilog.error(DOMAIN, TAG, `解析分布式游戏数据失败: ${JSON.stringify(error)}`);
              }
            } else if (gameDataString === lastProcessedGameData) {
              hilog.info(DOMAIN, TAG, '收到重复的游戏数据，跳过处理');
            } else if (!gameDataString) {
              hilog.info(DOMAIN, TAG, '收到空的游戏数据，跳过处理');
            }
          }
        });

        // 添加状态监听
        gameDataObject.on('status', (sessionId: string, networkId: string, status: string) => {
          hilog.info(DOMAIN, TAG, `对端分布式数据对象状态变化 - sessionId: ${sessionId}, networkId: ${networkId}, status: ${status}`);

          if (status === 'online') {
            hilog.info(DOMAIN, TAG, '对端分布式数据对象已上线，准备接收数据');
          }
        });

        // 3.3 从want中获取源端放入的sessionId，使用这个sessionId加入组网
        let distributedSessionId = want.parameters.distributedSessionId as string;
        hilog.info(DOMAIN, TAG, `对端设备获取到 distributedSessionId: ${distributedSessionId}`);
        gameDataObject.setSessionId(distributedSessionId);
      } else {
        hilog.warn(DOMAIN, TAG, '分布式数据对象未创建，跳过数据同步流程');
      }
    }
  }

  onNewWant(want: Want, launchParam: AbilityConstant.LaunchParam): void {
    let uri = want?.uri
    if (uri) {
      // 从链接中解析query参数，拿到参数后，开发者可根据自己的业务需求进行后续的处理。
      let urlObject = url.URL.parseURL(want?.uri);
      hilog.info(DOMAIN, TAG, `解析的URL: ${JSON.stringify(urlObject)}`);
      let gameDataString = urlObject.params.get('data')
      hilog.info(DOMAIN, TAG, gameDataString);
      // parse gameDataString to GameData
      if (gameDataString) {
        try {
          const gameData = JSON.parse(gameDataString) as GameData;
          // 将游戏数据存入AppStorage，供WebViewPage使用
          AppStorage.SetOrCreate('restoredGameData', gameData);
          // 通过EventBus发送初始化游戏数据的事件
          EventBus.emit(EventTopic.INIT_GAME_DATA, gameData);
          hilog.info(DOMAIN, TAG, `已通过事件总线发送初始化游戏状态事件`);
        } catch (error) {
          hilog.error(DOMAIN, TAG, `解析游戏数据失败: ${JSON.stringify(error)}`);
        }
      }
    }
    // 1.已配置快速拉起功能，应用立即启动时触发应用生命周期回调
    if (launchParam.launchReason === AbilityConstant.LaunchReason.PREPARE_CONTINUATION) {
      //若应用迁移数据较大，可在此处添加加载页面(页面中显示loading等)
      //可处理应用自定义跳转、时序等问题
      hilog.info(DOMAIN, TAG, '应用接续快速拉起功能');
    }
    if (launchParam.launchReason == AbilityConstant.LaunchReason.CONTINUATION) {
      if (want.parameters && want.parameters.continueSessionId) {
        this.restoreContinuationGameDataObject(want);
      }
    }


  }
  // 恢复接续的数据
  restoreContinuationGameDataObject(want: Want) {
    if (!want.parameters || !want.parameters.continueSessionId) {
      console.error(TAG + 'missing continueSessionId');
      return;
    }
    // 2.1 调用create接口创建并得到一个分布式数据对象实例
    let restoredGameData = new RestoredGameData(undefined);
    try {
      continueGameDataObject = distributedDataObject.create(this.context, restoredGameData);
    } catch (error) {
      hilog.error(DOMAIN, TAG, `创建接续分布式数据对象失败（模拟器可能不支持）: ${JSON.stringify(error)}`);
      continueGameDataObject = undefined;
      return;
    }

    // 2.2 注册恢复状态监听。收到状态为'restored'的回调通知时，表示接收端分布式数据对象已恢复发起端保存过来的数据（有资产数据时，对应的文件也迁移过来了）
    continueGameDataObject.on('status', (sessionId: string, networkId: string, status: string) => {
      if (status == 'restored') { // 收到'restored'的状态通知表示已恢复发起端保存的数据
        console.log(TAG + `gameData restored!!! : ${continueGameDataObject!['gameData']}`);
        // then communicate to the webview and update the game state
        try {
          // 从分布式数据对象中获取恢复的游戏数据
          const gameDataStr = continueGameDataObject!['gameData'] as string;
          if (gameDataStr) {
            // 解析JSON字符串为GameData对象
            const gameData = JSON.parse(gameDataStr) as GameData;
            console.log(TAG + `解析后的游戏数据: ${JSON.stringify(gameData)}`);

            // 将完整的游戏数据对象存入AppStorage，供WebViewPage使用
            AppStorage.SetOrCreate('restoredGameData', gameData);

            // 通过EventBus发送初始化游戏数据的事件
            EventBus.emit(EventTopic.INIT_GAME_DATA, gameData);
            console.log(TAG + `已通过事件总线发送初始化游戏状态事件`);
          } else {
            console.error(TAG + `恢复的游戏数据为空`);
          }
        } catch (error) {
          console.error(TAG + `解析游戏数据失败: ${JSON.stringify(error)}`);
        }
      }
    });

    // 2.3 从want.parameters中获取发起端放入的sessionId，调用setSessionId接口设置同步的sessionId
    let continueSessionId = want.parameters.continueSessionId as string;
    console.log(TAG + `get continueSessionId: ${continueSessionId}`);
    continueGameDataObject.setSessionId(continueSessionId);
  }
  onDestroy(): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onDestroy');
    
    // 清理分布式资源
    this.cleanupExistingConnections();
    
    // 清理AppStorage中的临时数据
    try {
      AppStorage.Delete('latestGameState');
      AppStorage.Delete('restoredGameData');
      hilog.info(DOMAIN, TAG, '已清理AppStorage中的临时数据');
    } catch (error) {
      hilog.error(DOMAIN, TAG, `清理AppStorage数据时出错: ${JSON.stringify(error)}`);
    }
    
    // 取消事件监听，避免内存泄漏
    EventBus.off(EventTopic.GAME_OVER);
  }

  onWindowStageCreate(windowStage: window.WindowStage): void {
    // Main window is created, set main page for this ability
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onWindowStageCreate');

    windowStage.loadContent('pages/WebViewPage', (err) => {
      if (err.code) {
        hilog.error(DOMAIN, TAG, 'Failed to load the content. Cause: %{public}s', JSON.stringify(err));
        return;
      }
      hilog.info(DOMAIN, TAG, 'Succeeded in loading the content.');
    });

    // 检测初始断点并存储到 AppStorage
    this.detectAndUpdateBreakpoint();
  }

  onWindowStageRestore(windowStage: window.WindowStage): void {
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onWindowStageRestore');
    windowStage.loadContent('pages/WebViewPage', (err) => {
    });
  }

  onWindowStageDestroy(): void {
    // Main window is destroyed, release UI related resources
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onWindowStageDestroy');
  }

  onForeground(): void {
    // Ability has brought to foreground
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onForeground');
  }

  onBackground(): void {
    // Ability has back to background
    hilog.info(DOMAIN, TAG, '%{public}s', 'Ability onBackground');

    // 保存当前游戏状态，以便在需要分布式接续时使用
    try {
      const gameState = GameStateManager.getCurrentGameState();
      if (gameState) {
        hilog.info(DOMAIN, TAG, `应用进入后台，当前游戏状态已保存: ${JSON.stringify(gameState)}`);
      }
    } catch (error) {
      hilog.error(DOMAIN, TAG, `保存游戏状态失败: ${JSON.stringify(error)}`);
    }
  }

  /**
   * 配置变更（屏幕旋转、折叠屏展开/折叠、分辨率变化等）
   */
  onConfigurationUpdate(newConfig: Configuration): void {
    hilog.info(DOMAIN, TAG, `配置变更: direction=${newConfig.direction}, screenDensity=${newConfig.screenDensity}`);
    this.detectAndUpdateBreakpoint();
  }

  /**
   * 检测当前窗口断点并更新到 AppStorage + EventBus
   * 断点定义: SM(<600vp) / MD(600-840vp) / LG(≥840vp)
   */
  private async detectAndUpdateBreakpoint(): Promise<void> {
    try {
      const windowClass = await window.getLastWindow(this.context);
      const properties = windowClass.getWindowProperties();
      const width = properties.windowRect.width;
      const height = properties.windowRect.height;
      const isLandscape = width > height ? 'landscape' : 'portrait';

      // 断点分类
      let breakpoint: string;
      if (width < 600) {
        breakpoint = 'sm';
      } else if (width < 840) {
        breakpoint = 'md';
      } else {
        breakpoint = 'lg';
      }

      const breakpointInfo: BreakpointInfo = {
        breakpoint: breakpoint,
        width: width,
        height: height,
        orientation: isLandscape
      };

      hilog.info(DOMAIN, TAG, `断点检测: ${breakpoint}, 宽=${width}, 高=${height}, 方向=${isLandscape}`);

      // 存储到 AppStorage，供所有页面使用
      AppStorage.SetOrCreate('currentBreakpoint', breakpoint);
      AppStorage.SetOrCreate('windowWidth', width);
      AppStorage.SetOrCreate('windowHeight', height);
      AppStorage.SetOrCreate('orientation', isLandscape);
    } catch (error) {
      hilog.warn(DOMAIN, TAG, `断点检测失败（模拟器可能不支持获取窗口属性）: ${JSON.stringify(error)}`);
      // 默认使用 sm 断点
      AppStorage.SetOrCreate('currentBreakpoint', 'sm');
      AppStorage.SetOrCreate('orientation', 'portrait');
    }
  }

  /**
   * 应用接续处理
   */
  onContinue(wantParam: Record<string, Object>): AbilityConstant.OnContinueResult {
    try {
      hilog.info(DOMAIN, TAG, '接续开始，同步方式获取游戏状态');

      // 直接从GameStateManager获取当前游戏状态
      const gameState = GameStateManager.getCurrentGameState();

      if (gameState) {
        hilog.info(DOMAIN, TAG, `成功获取游戏状态: ${JSON.stringify(gameState)}`);

        // 创建GameData对象
        const gameData = new GameData(gameState);

        // 序列化为JSON字符串
        const gameDataStr = JSON.stringify(gameData);
        const restoredGameData = new RestoredGameData(gameDataStr);

        // 1.1 调用create接口创建并得到一个分布式数据对象实例
        try {
          continueGameDataObject = distributedDataObject.create(this.context, restoredGameData);
        } catch (error) {
          hilog.error(DOMAIN, TAG, `接续时创建分布式数据对象失败（模拟器可能不支持）: ${JSON.stringify(error)}`);
          continueGameDataObject = undefined;
          return AbilityConstant.OnContinueResult.REJECT;
        }

        // 1.2 调用genSessionId接口创建一个sessionId，调用setSessionId接口设置同步的sessionId，并将这个sessionId放入wantParam
        let continueSessionId = distributedDataObject.genSessionId();
        console.log(TAG + `gen continueSessionId: ${continueSessionId}`);
        continueGameDataObject.setSessionId(continueSessionId);
        wantParam.continueSessionId = continueSessionId;

        // 1.3 从wantParam获取接收端设备networkId，使用这个networkId调用save接口保存数据到接收端
        let deviceId = wantParam.targetDevice as string;
        console.log(TAG + `get deviceId: ${deviceId}`);
        continueGameDataObject.save(deviceId);
        // 同意接续请求
        return AbilityConstant.OnContinueResult.AGREE;
      } else {
        hilog.error(DOMAIN, TAG, '游戏状态未初始化，拒绝接续请求');
        return AbilityConstant.OnContinueResult.REJECT;
      }
    } catch (error) {
      hilog.error(DOMAIN, TAG, `接续过程中出错: ${JSON.stringify(error)}`);
      return AbilityConstant.OnContinueResult.REJECT;
    }
  }
  // 1. 调用端调用startAbilityByCall接口拉起对端Ability
  callRemote(remoteDeviceId: string) {
    if (caller) {
      hilog.warn(DOMAIN, TAG, '已存在caller连接，将尝试复用现有连接');
      // 如果已有连接，尝试使用现有连接进行流转
      this.useExistingConnectionForFlow();
      return;
    }
    let context = getContext(this) as common.UIAbilityContext;

    // 1.1 调用genSessionId接口创建一个sessionId，通过分布式设备管理接口获取对端设备networkId
    try {
      distributedSessionId = distributedDataObject.genSessionId();
      hilog.info(DOMAIN, TAG, `生成sessionId: ${distributedSessionId}`);
    } catch (error) {
      hilog.error(DOMAIN, TAG, `生成sessionId失败（模拟器可能不支持）: ${JSON.stringify(error)}`);
      promptAction.showToast({
        message: '当前设备不支持分布式功能',
        duration: 3000
      });
      return;
    }

    // 1.2 组装want，并将sessionId放入want
    let want: Want = {
      bundleName: 'com.demo.snake',
      abilityName: 'EntryAbility',
      deviceId: remoteDeviceId,
      parameters: {
        'ohos.aafwk.param.callAbilityToForeground': true, // 前台启动，必须
        'distributedSessionId': distributedSessionId
      }
    }
    try {
      // 1.3 调用startAbilityByCall接口拉起对端Ability
      hilog.info(DOMAIN, TAG, '开始调用远程设备...');
      context.startAbilityByCall(want).then((res) => {
        if (!res) {
          hilog.error(DOMAIN, TAG, 'startAbilityByCall失败');
          return;
        }
        caller = res;
        hilog.info(DOMAIN, TAG, '远程设备调用成功，准备创建分布式数据对象');

        this.createDataObject();
      }).catch((error: BusinessError) => {
        hilog.error(DOMAIN, TAG, `startAbilityByCall失败: ${JSON.stringify(error)}`);
      });
    } catch (e) {
      let err = e as BusinessError;
      hilog.error(DOMAIN, TAG, `远程设备调用出错，错误码: ${err.code}，错误信息: ${err.message}`);
    }
  }
  transformGameOverData(gameState: GameState, boundaryCollision?: string): GameState {
    // 创建游戏状态的深拷贝，避免引用问题
    const modifiedGameState = JSON.parse(JSON.stringify(gameState)) as GameState;
    
    // 重置游戏结束状态，确保在对端能正常继续游戏
    modifiedGameState.gameOver = false;
    modifiedGameState.gamePaused = true; // 设置为暂停状态，等待玩家准备
    modifiedGameState.autoStart = true; // 设置自动开始标志
    modifiedGameState.gameStarted = false; // 重置游戏开始状态
    
    // 如果是边界碰撞导致的跨设备穿梭，设置对应的入口边界
    if (boundaryCollision) {
      switch (boundaryCollision) {
        case 'left':
          modifiedGameState.entryBoundary = 'right'; // 如果碰撞左边界，则从右边界进入
          break;
        case 'right':
          modifiedGameState.entryBoundary = 'left'; // 如果碰撞右边界，则从左边界进入
          break;
        case 'top':
          modifiedGameState.entryBoundary = 'bottom'; // 如果碰撞上边界，则从下边界进入
          break;
        case 'bottom':
          modifiedGameState.entryBoundary = 'top'; // 如果碰撞下边界，则从上边界进入
          break;
      }
      
      // 保存原始的边界碰撞信息，供前端处理边界穿梭
      modifiedGameState.boundaryCollision = boundaryCollision;
      
      hilog.info(DOMAIN, TAG, `设置入口边界为: ${modifiedGameState.entryBoundary}，原始碰撞边界: ${boundaryCollision}`);
    } else {
      // 非边界碰撞时，清除边界相关信息
      modifiedGameState.entryBoundary = undefined;
      modifiedGameState.boundaryCollision = undefined;
    }
    
    // 重置可能影响游戏继续的其他状态
    if (modifiedGameState.snake && modifiedGameState.snake.length > 0) {
      // 如果是边界穿梭，不要修改蛇的位置，让前端的边界穿梭逻辑来处理
      if (!boundaryCollision) {
        // 非边界穿梭时，确保蛇的状态是有效的
        modifiedGameState.snake.forEach(segment => {
          // 可以在这里添加对蛇身位置的调整逻辑
          // 比如确保蛇身在有效范围内
        });
      }
    }
    
    // 保持分数不变，让玩家在新设备上继续之前的游戏进度
    // modifiedGameState.score 保持原值
    
    hilog.info(DOMAIN, TAG, `游戏状态转换完成: gameOver=${modifiedGameState.gameOver}, gamePaused=${modifiedGameState.gamePaused}, autoStart=${modifiedGameState.autoStart}, gameStarted=${modifiedGameState.gameStarted}`);
    
    return modifiedGameState;
  }

  // 通知前端显示游戏结束弹窗
  notifyShowGameOverDialog() {
    hilog.info(DOMAIN, TAG, '通知前端显示游戏结束弹窗');
    // 使用EventBus发送显示游戏结束弹窗的事件
    EventBus.emit(EventTopic.SHOW_GAME_OVER_DIALOG, null);
  }

  /**
   * 处理边界碰撞的分布式流转逻辑
   * 优先使用现有连接，如无连接则建立新连接
   */
  handleBoundaryCollisionFlow() {
    hilog.info(DOMAIN, TAG, '开始处理边界碰撞分布式流转');
    
    // 检查是否有现有的caller连接
    if (caller) {
      hilog.info(DOMAIN, TAG, '发现现有caller连接，尝试使用现有连接进行流转');
      this.useExistingConnectionForFlow();
      return;
    }
    
    // 检查是否有现有的gameDataObject
    if (gameDataObject) {
      hilog.info(DOMAIN, TAG, '发现现有gameDataObject，尝试复用分布式数据对象');
      this.useExistingDataObjectForFlow();
      return;
    }
    
    // 如果没有现有连接，获取远程设备并建立新连接
    const remoteDeviceId = getRemoteDeviceId();
    
    if (remoteDeviceId) {
      hilog.info(DOMAIN, TAG, `找到可用设备: ${remoteDeviceId}，建立新连接进行跨设备穿梭`);
      this.callRemote(remoteDeviceId);
    } else {
      hilog.info(DOMAIN, TAG, '没有找到可用设备，将正常处理游戏结束');
      // 显示提示信息
      promptAction.showToast({
        message: '游戏结束，没有找到可用设备继续游戏',
        duration: 3000
      });
      
      // 通知前端显示游戏结束弹窗
      this.notifyShowGameOverDialog();
    }
  }

  /**
   * 使用现有caller连接进行流转
   */
  useExistingConnectionForFlow() {
    hilog.info(DOMAIN, TAG, '使用现有caller连接进行流转');
    
    // 如果有现有的gameDataObject，直接更新数据
    if (gameDataObject) {
      this.updateExistingDataObject();
    } else {
      // 如果没有gameDataObject但有caller，重新创建数据对象
      hilog.info(DOMAIN, TAG, '有caller但无gameDataObject，重新创建数据对象');
      this.createDataObject();
    }
  }

  /**
   * 使用现有分布式数据对象进行流转
   */
  useExistingDataObjectForFlow() {
    hilog.info(DOMAIN, TAG, '使用现有分布式数据对象进行流转');
    this.updateExistingDataObject();
  }

  /**
   * 更新现有的分布式数据对象
   */
  updateExistingDataObject() {
    if (!gameDataObject) {
      hilog.error(DOMAIN, TAG, '分布式数据对象不存在，无法更新');
      return;
    }

    const latestGameState = AppStorage.Get<GameState>('latestGameState');
    
    if (latestGameState) {
      hilog.info(DOMAIN, TAG, `使用现有分布式对象更新游戏状态，gameOver=${latestGameState.gameOver}, gamePaused=${latestGameState.gamePaused}`);
      
      // 创建GameData对象
      const gameData = new GameData(latestGameState);
      
      // 直接更新现有的分布式数据对象
      const gameDataStr = JSON.stringify(gameData);
      
      // 使用显式属性赋值来触发分布式数据同步
      try {
        gameDataObject['gameData'] = gameDataStr;
        hilog.info(DOMAIN, TAG, `现有分布式对象已更新，gameOver=${gameData.gameOver}, gamePaused=${gameData.gamePaused}, entryBoundary=${gameData.entryBoundary}`);
      } catch (error) {
        hilog.error(DOMAIN, TAG, `更新现有分布式对象失败: ${JSON.stringify(error)}`);
        // 如果更新失败，尝试重新建立连接
        this.fallbackToNewConnection();
      }
    } else {
      hilog.error(DOMAIN, TAG, '获取游戏状态失败，无法更新分布式数据对象');
      this.fallbackToNewConnection();
    }
  }

  /**
   * 回退到建立新连接的方案
   */
  fallbackToNewConnection() {
    hilog.info(DOMAIN, TAG, '回退到建立新连接的方案');
    
    // 清理现有资源
    this.cleanupExistingConnections();
    
    // 获取远程设备并建立新连接
    const remoteDeviceId = getRemoteDeviceId();
    
    if (remoteDeviceId) {
      hilog.info(DOMAIN, TAG, `回退方案：使用设备 ${remoteDeviceId} 建立新连接`);
      this.callRemote(remoteDeviceId);
    } else {
      hilog.info(DOMAIN, TAG, '回退方案：没有找到可用设备，显示游戏结束');
      // 显示提示信息
      promptAction.showToast({
        message: '游戏结束，设备连接失败',
        duration: 3000
      });
      
      // 通知前端显示游戏结束弹窗
      this.notifyShowGameOverDialog();
    }
  }

  /**
   * 清理现有连接和数据对象
   */
  cleanupExistingConnections() {
    hilog.info(DOMAIN, TAG, '清理现有连接和数据对象');
    
    try {
      // 清理分布式数据对象
      if (gameDataObject) {
        gameDataObject.off('change');
        gameDataObject.off('status');
        gameDataObject = undefined;
        hilog.info(DOMAIN, TAG, '已清理gameDataObject');
      }
      
      // 清理caller连接
      if (caller) {
        caller.release();
        caller = undefined;
        hilog.info(DOMAIN, TAG, '已清理caller连接');
      }
      
      // 清理sessionId
      distributedSessionId = '';
      hilog.info(DOMAIN, TAG, '已清理distributedSessionId');
      
    } catch (error) {
      hilog.error(DOMAIN, TAG, `清理连接时出错: ${JSON.stringify(error)}`);
    }
  }
  // 2. 拉起对端Ability后创建分布式数据对象
  createDataObject() {
    if (!caller) {
      hilog.error(DOMAIN, TAG, '请先调用远程设备');
      return;
    }
    if (gameDataObject) {
      hilog.warn(DOMAIN, TAG, '分布式数据对象已存在，将更新现有对象');
      this.updateExistingDataObject();
      return;
    }
    let context = getContext(this) as common.UIAbilityContext;

    // 2.1 创建分布式数据对象实例
    // 从 AppStorage 中获取游戏状态，而不是通过 GameStateManager 获取
    const latestGameState = AppStorage.Get<GameState>('latestGameState');

    if (latestGameState) {
      hilog.info(DOMAIN, TAG, `从 AppStorage 中获取游戏状态成功，gameOver=${latestGameState.gameOver}, gamePaused=${latestGameState.gamePaused}`);

      // 创建GameData对象，游戏状态已经在transformGameOverData中处理好了
      const gameData = new GameData(latestGameState);

      let restoredGameData = new RestoredGameData(JSON.stringify(gameData));

      hilog.info(DOMAIN, TAG, '创建分布式数据对象...');
      try {
        gameDataObject = distributedDataObject.create(context, restoredGameData);
      } catch (error) {
        hilog.error(DOMAIN, TAG, `创建分布式数据对象失败（模拟器可能不支持）: ${JSON.stringify(error)}`);
        gameDataObject = undefined;
        return;
      }

      // 2.2 注册数据变更监听
      gameDataObject.on('change', (sessionId: string, fields: Array<string>) => {
        hilog.info(DOMAIN, TAG, `数据对象变更，sessionId: ${sessionId}`);
        fields.forEach((field) => {
          hilog.info(DOMAIN, TAG, `${field}: ${gameDataObject![field]}`);
        });
        
        // 检查是否有 gameData 字段更新
        if (fields.includes('gameData')) {
          const gameDataString = gameDataObject!['gameData'] as string;
          if (gameDataString && gameDataString !== lastProcessedGameData) {
            hilog.info(DOMAIN, TAG, `收到分布式游戏数据: ${gameDataString}`);
            lastProcessedGameData = gameDataString; // 记录已处理的数据
            
            try {
              const gameData = JSON.parse(gameDataString) as GameData;
              
              // 版本号校验：忽略低版本数据，防止分布式状态回滚
              const incomingVersion = gameData.stateVersion || 0;
              if (incomingVersion > 0 && incomingVersion <= lastProcessedVersion) {
                hilog.info(DOMAIN, TAG, `忽略低版本数据: 收到=${incomingVersion}, 当前=${lastProcessedVersion}`);
                return;
              }
              lastProcessedVersion = incomingVersion;
              
              // 添加接收时间戳，避免重复处理
              const dataWithTimestamp: DistributedGameStateData = {
                snake: gameData.snake,
                food: gameData.food,
                direction: gameData.direction,
                nextDirection: gameData.nextDirection,
                score: gameData.score,
                speed: gameData.speed,
                gameStarted: gameData.gameStarted,
                gameOver: gameData.gameOver,
                gamePaused: gameData.gamePaused,
                highScore: gameData.highScore,
                autoStart: gameData.autoStart,
                boundaryCollision: gameData.boundaryCollision,
                entryBoundary: gameData.entryBoundary,
                stateVersion: gameData.stateVersion || 0,
                receivedAt: Date.now()
              };
              
              // 将游戏数据存入AppStorage，供WebViewPage使用
              AppStorage.SetOrCreate('restoredGameData', dataWithTimestamp);
              // 通过EventBus发送初始化游戏数据的事件
              EventBus.emit(EventTopic.INIT_GAME_DATA, dataWithTimestamp);
              hilog.info(DOMAIN, TAG, `已通过事件总线发送初始化游戏状态事件，时间戳: ${dataWithTimestamp.receivedAt}`);
            } catch (error) {
              hilog.error(DOMAIN, TAG, `解析分布式游戏数据失败: ${JSON.stringify(error)}`);
            }
          } else if (gameDataString === lastProcessedGameData) {
            hilog.info(DOMAIN, TAG, '收到重复的游戏数据，跳过处理');
          } else if (!gameDataString) {
            hilog.info(DOMAIN, TAG, '收到空的游戏数据，跳过处理');
          }
        }
      });

      // 添加状态监听
      gameDataObject.on('status', (sessionId: string, networkId: string, status: string) => {
        hilog.info(DOMAIN, TAG, `分布式数据对象状态变化 - sessionId: ${sessionId}, networkId: ${networkId}, status: ${status}`);

        if (status === 'online') {
          hilog.info(DOMAIN, TAG, '分布式数据对象已上线，数据同步就绪');
        }
      });

      // 2.3 设置同步sessionId加入组网
      hilog.info(DOMAIN, TAG, '设置分布式数据对象sessionId，加入组网');
      gameDataObject.setSessionId(distributedSessionId);

      // 等待数据对象上线后再进行数据同步
      setTimeout(() => {
        hilog.info(DOMAIN, TAG, '开始设置游戏数据到分布式对象');
        // 确保数据已经设置到分布式对象中
        const gameDataStr = JSON.stringify(gameData);
        gameDataObject!['gameData'] = gameDataStr;
        hilog.info(DOMAIN, TAG, `游戏数据已设置，gameOver=${gameData.gameOver}, gamePaused=${gameData.gamePaused}`);
      }, 1500); // 增加等待时间，确保对端准备就绪
    } else {
      hilog.error(DOMAIN, TAG, '获取游戏状态失败，无法创建分布式数据对象');
    }
  }

  /**
   * 接收远程设备发送的游戏状态数据
   * 此方法将被远程设备调用
   */
  setRemoteGameData(jsonData: string): string {
    hilog.info(DOMAIN, TAG, `收到远程游戏数据: ${jsonData}`);

    try {
      // 解析接收到的JSON数据
      const gameData = JSON.parse(jsonData) as GameData;

      // 将游戏数据存入AppStorage
      AppStorage.SetOrCreate('restoredGameData', gameData);

      // 通过EventBus发送初始化游戏数据的事件
      EventBus.emit(EventTopic.INIT_GAME_DATA, gameData);

      hilog.info(DOMAIN, TAG, '游戏数据已通过事件总线发送');
      return "success";
    } catch (error) {
      hilog.error(DOMAIN, TAG, `处理远程游戏数据出错: ${JSON.stringify(error)}`);
      return "error";
    }
  }
}
// 获取可信组网中的设备
function getRemoteDeviceId() {
  let deviceId = "";
  try {
    hilog.info(DOMAIN, TAG, '开始获取远程设备ID');
    // 创建设备管理器
    let deviceManager: distributedDeviceManager.DeviceManager;
    try {
      deviceManager = distributedDeviceManager.createDeviceManager('com.demo.snake');
    } catch (error) {
      hilog.error(DOMAIN, TAG, `创建设备管理器失败（模拟器可能不支持）: ${JSON.stringify(error)}`);
      return "";
    }

    // 获取可用设备列表
    let devices: Array<distributedDeviceManager.DeviceBasicInfo> = deviceManager.getAvailableDeviceListSync();
    hilog.info(DOMAIN, TAG, `找到 ${devices.length} 台可用设备`);

    // 遍历所有可用设备
    for (let i = 0; i < devices.length; i++) {
      const device: distributedDeviceManager.DeviceBasicInfo = devices[i];
      hilog.info(DOMAIN, TAG, `设备${i+1}信息: 名称=${device.deviceName}, 类型=${device.deviceType}, networkId=${device.networkId}`);

      if (device && device.networkId) {
        deviceId = device.networkId;
        hilog.info(DOMAIN, TAG, `选择设备: ${device.deviceName}, networkId: ${deviceId}`);
        break;
      }
    }

    if (!deviceId) {
      hilog.warn(DOMAIN, TAG, '没有找到远程设备，尝试使用第一个可用设备');
      if (devices[0] && devices[0].networkId) {
        deviceId = devices[0].networkId;
        hilog.info(DOMAIN, TAG, `选择第一个可用设备: ${devices[0].deviceName}, networkId: ${deviceId}`);
      }
    }
  } catch (e) {
    let err = e as BusinessError;
    hilog.error(DOMAIN, TAG, `获取远程设备ID出错, 错误码: ${err.code}, 错误信息: ${err.message}`);
  }
  return deviceId;
}