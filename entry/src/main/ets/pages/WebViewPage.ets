import { webview } from '@kit.ArkWeb';
import router from '@ohos.router';
import { promptAction } from '@kit.ArkUI';
import { GameData, SnakeSegment, FoodPosition, GameState } from '../common/model/GameData';
import EventBus, { EventTopic } from '../common/service/EventBus';
import GameStateManager from '../common/service/GameStateManager';
import { systemShare, harmonyShare } from '@kit.ShareKit';
import { fileUri } from '@kit.CoreFileKit';
import { uniformTypeDescriptor as utd } from '@kit.ArkData';
import { hilog } from '@kit.PerformanceAnalysisKit';
import { common, abilityAccessCtrl } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { distributedDeviceManager } from '@kit.DistributedServiceKit';
import { BusinessError } from '@kit.BasicServicesKit';

const DOMAIN = 0x0000;
const TAG = 'WebViewPage';

interface DiscoverParam {
  discoverTargetType: number;
}
interface FilterOptions {
  availableStatus: number;
  discoverDistance: number;
  authenticationStatus: number;
  authorizationType: number;
}
let discoverParam: Record<string, number> = {
  'discoverTargetType': 1
};
let filterOptions: Record<string, number> = {
  'availableStatus': 0
};

class Data {
  deviceId: string = '';
}
let bindParam: Record<string, string | number> = {
  'bindType': 1,
  'targetPkgName': 'com.demo.snake',
  'appName': 'Genji掘金大冒险',
  'appOperation': 'sync',
  'customDescription': 'this is a test'
};

// 定义游戏中使用的类型
interface GameDataInput {
  snake: SnakeSegment[];
  food: FoodPosition;
  direction: string;
  score: number;
  speed: number;
  autoStart?: boolean;
  paused?: boolean;
}

// 定义游戏结束事件数据接口
interface GameOverEvent {
  score: number;
  gameState?: GameState; // 添加游戏状态数据字段
  boundaryCollision?: string; // 添加边界碰撞信息字段，表示碰撞的是哪个边界（left/right/top/bottom）
}

class NativeClass {
  constructor() {
  }

  // 定义一个方法用于接收H5传递的游戏数据
  gameOver(gameStateJson: string): void {
    try {
      // 解析传入的游戏状态JSON字符串
      const gameState = JSON.parse(gameStateJson) as GameState;
      const score = gameState.score;
      const boundaryCollision = gameState.boundaryCollision;
      
      console.info(`游戏结束，分数: ${score}，接收到完整游戏状态数据，边界碰撞: ${boundaryCollision || 'none'}`);
      
      // 通过EventBus发送游戏结束事件，包含完整的游戏状态数据
      const gameOverData: GameOverEvent = { 
        score, 
        gameState,
        boundaryCollision
      };
      
      // 如果是边界碰撞，显示提示信息
      if (boundaryCollision) {
        promptAction.showToast({
          message: "正在尝试连接其他设备继续游戏...",
          duration: 2000
        });
      }
      
      // 发送游戏结束事件，触发分布式连接
      console.info(`发送游戏结束事件，准备触发分布式连接，当前分数: ${score}，边界碰撞: ${boundaryCollision || 'none'}`);
      EventBus.emit(EventTopic.GAME_OVER, gameOverData);
    } catch (error) {
      console.error(`解析游戏状态数据失败: ${JSON.stringify(error)}`);
    }
  }

  // 添加方法用于H5主动更新游戏状态到Native
  updateGameState(gameStateJson: string): void {
    try {
      // 解析游戏状态JSON
      const gameState = JSON.parse(gameStateJson) as GameState;
      
      // 只有在游戏进行中且未暂停未结束时才更新和打印日志
      if (gameState && gameState.gameStarted && !gameState.gameOver && !gameState.gamePaused) {
        console.info(`H5主动更新游戏状态`);
        // 更新到GameStateManager
        GameStateManager.updateGameState(gameState);
      } else if (gameState) {
        // 在状态变化的关键时刻只更新一次（游戏开始/暂停/结束）
        // 使用静默更新，不输出日志
        GameStateManager.updateGameState(gameState);
      }
    } catch (error) {
      console.error(`解析游戏状态失败: ${error}`);
    }
  }
}

@Entry
@Component
export struct WebViewPage {
  webController: webview.WebviewController = new webview.WebviewController();
  @State nativeObject: NativeClass = new NativeClass();
  @State url: string = '';
  @State isGameDataRestored: boolean = false;
  @State restoredGameData: GameData | null = null;
  @StorageLink('currentBreakpoint') currentBreakpoint: string = 'sm';
  @StorageLink('orientation') orientation: string = 'portrait';
  @StorageLink('windowWidth') windowWidth: number = 375;
  @StorageLink('windowHeight') windowHeight: number = 812;
  private isWebViewReady: boolean = false;

  // 用于初始化游戏数据的方法
  initGameData(gameData: GameData): void {
    // 首先检查函数是否存在
    this.webController.runJavaScript('typeof window.initGameDataFromNative === "function"', (error, result) => {
      if (error || result === 'false') {
        console.error(`initGameDataFromNative函数不存在，将在500ms后重试`);
        // 如果函数不存在，等待一段时间后重试
        setTimeout(() => {
          this.initGameData(gameData);
        }, 500);
        return;
      }
      
      // 函数存在，调用它
      this.webController.runJavaScript(`window.initGameDataFromNative(${JSON.stringify(gameData)})`, (error, result) => {
        if (error) {
          console.error(`初始化游戏数据失败: ${error.message}`);
        } else {
          console.info(`初始化游戏数据成功: ${result}`);
        }
      });
    });
  }

  // 获取当前游戏状态，用于应用接续
  getCurrentGameState(): Promise<GameState> {
    return new Promise((resolve, reject) => {
      // 首先检查函数是否存在
      this.webController.runJavaScript('typeof window.getCurrentGameState === "function"', (error, result) => {
        if (error || result === 'false') {
          console.error(`getCurrentGameState函数不存在，将使用缓存数据`);
          // 如果函数不存在，使用缓存的游戏状态
          const cachedState = GameStateManager.getCurrentGameState();
          if (cachedState) {
            resolve(cachedState);
          } else {
            reject(new Error('getCurrentGameState函数不存在且无缓存数据'));
          }
          return;
        }
        
        // 函数存在，调用它
        this.webController.runJavaScript('window.getCurrentGameState()', (error, result) => {
          if (error) {
            console.error(`获取游戏状态失败: ${error.message}`);
            reject(error);
          } else {
            console.info(`获取游戏状态成功: ${result}`);
            try {
              // 尝试将结果解析为JSON对象
              const gameState = JSON.parse(result.toString()) as GameState;
              // 实时更新到GameStateManager
              GameStateManager.updateGameState(gameState);
              resolve(gameState);
            } catch (e) {
              console.error(`解析游戏状态失败: ${e}`);
              reject(e);
            }
          }
        });
      });
    });
  }

  /**
   * 将当前断点信息注入到 H5 层，并触发画布重算
   */
  injectBreakpointToH5(): void {
    if (!this.isWebViewReady) {
      return;
    }
    try {
      const breakpointData = JSON.stringify({
        breakpoint: this.currentBreakpoint,
        orientation: this.orientation,
        width: this.windowWidth,
        height: this.windowHeight
      });
      try {
        this.webController.runJavaScript(
          `(function(){ try { window.__breakpointData = ${breakpointData}; if(window.document.readyState==='complete' && typeof initCanvas==='function'){ initCanvas(); if(typeof snake !== 'undefined' && snake.length > 0 && typeof gameStarted !== 'undefined' && !gameStarted){ draw(); } } } catch(e){ console.error('bp inj err:', e); } })()`,
          (error, result) => {
            if (error) {
              console.error(`注入断点信息到H5失败: ${error.message}`);
            }
          }
        );
      } catch (runJsError) {
        console.error(`runJavaScript 调用异常（WebView可能未就绪）: ${JSON.stringify(runJsError)}`);
      }
    } catch (e) {
      console.error(`injectBreakpointToH5 异常: ${JSON.stringify(e)}`);
    }
  }

  aboutToAppear() {
    // 添加显示游戏结束弹窗的事件监听
    EventBus.on(EventTopic.SHOW_GAME_OVER_DIALOG, () => {
      console.info('收到显示游戏结束弹窗的事件');
      // 调用WebView的JavaScript方法显示游戏结束弹窗
      this.webController.runJavaScript('window.showGameOverDialog && window.showGameOverDialog()', (error, result) => {
        if (error) {
          console.error(`显示游戏结束弹窗失败: ${error.message}`);
        } else {
          console.info('游戏结束弹窗显示成功');
        }
      });
    });
    
    // 检查是否有来自应用接续的数据
    try {
      // 从AppStorage获取恢复的游戏数据
      const restoredData = AppStorage.Get<GameData>('restoredGameData');
      if (restoredData) {
        console.info(`检测到应用接续数据`);
        this.restoredGameData = restoredData;
        this.isGameDataRestored = true;
        
        // 清除AppStorage中的数据，避免重复恢复
        AppStorage.Delete('restoredGameData');
      }
    } catch (error) {
      console.error(`处理应用接续数据失败: ${error}`);
    }
    // 注册事件监听
    EventBus.on(EventTopic.INIT_GAME_DATA, (gameData: GameData) => {
      console.info(`WebViewPage收到初始化游戏数据事件`);
      if (this.webController) {
        this.initGameData(gameData);
      } else {
        console.error('WebController尚未初始化，无法初始化游戏数据');
      }
    });
    
    // 监听获取游戏状态请求
    EventBus.on(EventTopic.GET_GAME_STATE, async () => {
      console.info(`WebViewPage收到获取游戏状态请求`);
      try {
        const gameState = await this.getCurrentGameState();
        console.info(`成功获取游戏状态，发送结果事件`);
        // 发布游戏状态结果事件
        EventBus.emit(EventTopic.GAME_STATE_RESULT, gameState);
      } catch (error) {
        console.error(`获取游戏状态失败: ${error}`);
        // 尝试使用缓存的游戏状态
        const cachedState = GameStateManager.getCurrentGameState();
        if (cachedState) {
          console.info(`使用缓存的游戏状态`);
          EventBus.emit(EventTopic.GAME_STATE_RESULT, cachedState);
        } else {
          // 发送一个空的游戏状态作为结果
          EventBus.emit(EventTopic.GAME_STATE_RESULT, null);
        }
      }
    });
    
    // 监听游戏结束事件
    EventBus.on(EventTopic.GAME_OVER, (event: GameOverEvent) => {
      console.info(`WebViewPage收到游戏结束事件，分数: ${event.score}`);
      
      // 获取当前游戏状态，确保保存的是最新状态
      this.getCurrentGameState().then((gameState) => {
        console.info(`游戏结束时，已保存最新游戏状态: ${JSON.stringify(gameState)}`);
      }).catch((error: Error) => {
        console.error(`游戏结束时获取状态失败: ${error}`);
      });
    });
    
    
    const context = getContext(this) as common.UIAbilityContext;
    const filesDir = context.filesDir;
    try {
      [
        [context.resourceManager.getMediaContentSync($r('app.media.share')), '/share.png']
      ].forEach(item => {
        let file = fs.openSync(filesDir + item[1], fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE);
        let writeLen = fs.writeSync(file.fd, (item[0] as Uint8Array).buffer);
        hilog.info(DOMAIN, TAG, "write data to file succeed and size is:" + writeLen);
        fs.closeSync(file);
      })
    } catch (error) {
      hilog.warn(DOMAIN, TAG, `媒体文件复制失败（模拟器可能不支持文件操作，碰一碰分享功能不可用）: ${JSON.stringify(error)}`);
    }
    try {
      harmonyShare.on('knockShare', this.purityCallback);
    } catch (error) {
      hilog.error(DOMAIN, TAG, `注册碰一碰分享失败（模拟器可能不支持）: ${JSON.stringify(error)}`);
    }
  }
  private purityCallback(sharableTarget: harmonyShare.SharableTarget) {
    hilog.info(DOMAIN, TAG, 'knockShare 分享数据');
    const contextFaker: Context = getContext(this);
    let filePath = contextFaker.filesDir + '/share.png';
    let gameDataString = JSON.stringify(GameStateManager.getCurrentGameState());
    let shareData: systemShare.SharedData = new systemShare.SharedData({
      utd: utd.UniformDataType.HYPERLINK,
      content: "https://boostfield.com/snakeapp/.well-known/applinking.json?data=" + encodeURIComponent(gameDataString),
      thumbnailUri: fileUri.getUriFromPath(filePath)
    });
    sharableTarget.share(shareData);
  }
  aboutToDisappear() {
    // 取消所有事件监听
    EventBus.off(EventTopic.INIT_GAME_DATA);
    EventBus.off(EventTopic.GET_GAME_STATE);
    EventBus.off(EventTopic.GAME_OVER);
    
    // 释放分布式资源相关的清理工作
    try {
      harmonyShare.off('knockShare', this.purityCallback);
    } catch (error) {
      hilog.error(DOMAIN, TAG, `注销碰一碰分享失败（模拟器可能不支持）: ${JSON.stringify(error)}`);
    }
  }

  build() {
    Column() {
      Row() {
          
        Text('Genji掘金大冒险')
          .fontSize(20)
          .fontWeight(FontWeight.Bold)
          .layoutWeight(1)
          .textAlign(TextAlign.Center)
        Text('配对')
          .onClick(() => {
            let context = getContext(this) as common.UIAbilityContext;
            let atManager = abilityAccessCtrl.createAtManager();
            try {
              atManager.requestPermissionsFromUser(context, ['ohos.permission.DISTRIBUTED_DATASYNC']).then((data) => {
                console.log('data: ' + JSON.stringify(data));

                try {
                  let dmInstance = distributedDeviceManager.createDeviceManager('com.demo.snake');
                  dmInstance.on('discoverSuccess', data => {
                    console.log('discoverSuccess on:' + JSON.stringify(data))
                    try {
                      dmInstance.bindTarget(data.device.deviceId, bindParam, (err: BusinessError, data: Data) => {
                        if (err) {
                          console.error('bindTarget errCode:' + err.code + ',errMessage:' + err.message);
                          return;
                        }
                        console.info('bindTarget result:' + JSON.stringify(data));
                      });
                    } catch (err) {
                      let e: BusinessError = err as BusinessError;
                      console.error('bindTarget errCode:' + e.code + ',errMessage:' + e.message);
                    }
                  });
                  dmInstance.on('discoverFailure', data => console.log('discoverFailure on:' + JSON.stringify(data)));
                  try {
                    dmInstance.startDiscovering(discoverParam, filterOptions);
                  } catch (err) {
                    let e: BusinessError = err as BusinessError;
                    console.error('startDiscovering errCode:' + e.code + ',errMessage:' + e.message);
                  }
                } catch(err) {
                  let e: BusinessError = err as BusinessError;
                  console.error('createDeviceManager errCode:' + e.code + ',errMessage:' + e.message);
                  promptAction.showToast({
                    message: '当前设备不支持分布式配对功能',
                    duration: 2000
                  });
                }
              }).catch((err: object) => {
                console.error('配对失败: ' + JSON.stringify(err));
                promptAction.showToast({
                  message: '当前设备不支持分布式配对功能',
                  duration: 2000
                });
              })
            } catch (err) {
              console.error('配对初始化失败: ' + JSON.stringify(err));
              promptAction.showToast({
                message: '当前设备不支持分布式配对功能',
                duration: 2000
              });
            }
          })
      }
      .width('100%')
      .height(50)
      
      Web({ 
        src: $rawfile('index.html'),
        controller: this.webController 
      })
      .javaScriptAccess(true)
      .layoutWeight(1)
      .width('100%')
      .domStorageAccess(true)
      .fileAccess(true)
      .javaScriptProxy({
        object: this.nativeObject,
        name: 'JSBridge',
        methodList: ['gameOver', 'updateGameState'],
        controller: this.webController
      })
      .onPageEnd(() => {
        // 标记 WebView 已就绪
        this.isWebViewReady = true;
        
        // 页面加载完成后注入断点信息
        this.injectBreakpointToH5();

        // 页面加载完成后检查是否需要恢复游戏状态
        if (this.isGameDataRestored && this.restoredGameData) {
          console.info('检测到应用接续数据，开始恢复游戏状态');
          
          // 延迟一点时间确保H5页面已完全加载
          setTimeout(() => {
            this.initGameData(this.restoredGameData!);
            console.info('已恢复游戏状态');
          }, 500);
          
        } else {
          console.info('没有检测到应用接续数据，加载默认游戏状态');
        }
        
        // 注入改进版的自动同步脚本到H5，添加状态跟踪机制
        this.webController.runJavaScript(`
          // 添加状态跟踪变量，避免重复同步相同的状态
          window.lastSyncedState = {
            gameStarted: false,
            gameOver: false,
            gamePaused: false
          };
          
          // 记录上次同步时间，控制同步频率
          window.lastSyncTime = 0;
          
          // 为游戏状态添加智能自动同步功能
          window.syncIntervalId = setInterval(() => {
            if (window.JSBridge && typeof window.getCurrentGameState === 'function') {
              try {
                const gameState = window.getCurrentGameState();
                const currentTime = Date.now();
                
                // 状态变化检测
                const stateChanged = 
                  window.lastSyncedState.gameStarted !== gameState.gameStarted ||
                  window.lastSyncedState.gameOver !== gameState.gameOver || 
                  window.lastSyncedState.gamePaused !== gameState.gamePaused;
                
                // 只有在游戏活跃状态下才定期同步数据
                if (gameState.gameStarted && !gameState.gameOver && !gameState.gamePaused) {
                  // 活跃状态下每秒同步一次
                  if (currentTime - window.lastSyncTime >= 1000) {
                    window.JSBridge.updateGameState(JSON.stringify(gameState));
                    window.lastSyncTime = currentTime;
                  }
                } 
                // 在状态变化时立即同步一次
                else if (stateChanged) {
                  window.JSBridge.updateGameState(JSON.stringify(gameState));
                  window.lastSyncTime = currentTime;
                  
                  // 游戏结束后停止同步定时器
                  if (gameState.gameOver) {
                    // 同步一次最终状态后，停止自动同步定时器
                    clearInterval(window.syncIntervalId);
                    console.log('游戏结束，停止自动同步');
                  }
                }
                
                // 更新上次同步的状态
                window.lastSyncedState = {
                  gameStarted: gameState.gameStarted,
                  gameOver: gameState.gameOver,
                  gamePaused: gameState.gamePaused
                };
              } catch (e) {
                console.error('自动同步游戏状态失败:', e);
              }
            }
          }, 250);  // 检查间隔缩短到250毫秒，但实际同步频率仍然受控
        `, (error, result) => {
          if (error) {
            console.error(`注入自动同步脚本失败: ${error.message}`);
          } else {
            console.info('已注入智能自动同步脚本');
          }
        });
      })
    }
    .width('100%')
    .height('100%')
  }
}