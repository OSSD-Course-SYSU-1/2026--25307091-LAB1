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
import { DeepSeekService, AdminQuestion, AdminOption, AdminAIRequest, GameContext } from '../common/service/DeepSeekService';
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

// 管理员 AI 请求原始数据（来自 H5）
class AdminRequestRaw {
  userMessage: string = '';
  gameContext: GameContext = new GameContext();
  grantedCommands: string[] = [];
  sessionId: string = '';
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

  /**
   * 自由流转请求（H5 → 原生）
   * H5 调用 JSBridge.requestTransfer(JSON.stringify(gameState))
   */
  requestTransfer(gameStateJson: string): void {
    try {
      console.info('收到自由流转请求');
      const eventData: GameOverEvent = {
        score: 0,
        gameState: JSON.parse(gameStateJson) as GameState,
        boundaryCollision: 'transfer'
      };
      EventBus.emit(EventTopic.GAME_OVER, eventData);
    } catch (err) {
      console.error('自由流转请求解析失败: ' + JSON.stringify(err));
    }
  }

  /**
   * 管理员 AI 请求入口（H5 → 原生）
   * H5 调用 JSBridge.callDeepSeek(JSON.stringify(request))
   * 原生层通过 EventBus 异步处理，结果通过 runJavaScript 回传
   */
  callDeepSeek(requestJson: string): void {
    try {
      const request: AdminRequestRaw = JSON.parse(requestJson) as AdminRequestRaw;
      console.info('收到管理员AI请求: ' + JSON.stringify(request).substring(0, 150) + '...');

      // 通过 EventBus 转发到 WebViewPage 的监听器处理（需要访问 webController）
      EventBus.emit(EventTopic.ADMIN_AI_REQUEST, request);
    } catch (err) {
      console.error('解析管理员AI请求失败: ' + JSON.stringify(err));
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
    const jsCode1: string = 'typeof window.initGameDataFromNative === "function"';
    this.webController.runJavaScript(jsCode1, (error: Error, result: string) => {
      if (error || result === 'false') {
        console.error('initGameDataFromNative函数不存在，将在500ms后重试');
        // 如果函数不存在，等待一段时间后重试
        setTimeout(() => {
          this.initGameData(gameData);
        }, 500);
        return;
      }

      // 函数存在，调用它
      const gameDataJson: string = JSON.stringify(gameData);
      const jsCode2: string = 'window.initGameDataFromNative(' + gameDataJson + ')';
      this.webController.runJavaScript(jsCode2, (error2: Error, result2: string) => {
        if (error2) {
          console.error('初始化游戏数据失败: ' + error2.message);
        } else {
          console.info('初始化游戏数据成功: ' + result2);
        }
      });
    });
  }

  // 获取当前游戏状态，用于应用接续
  getCurrentGameState(): Promise<GameState> {
    return new Promise((resolve, reject) => {
      const ctrl: webview.WebviewController = this.webController;
      // 首先检查函数是否存在
      ctrl.runJavaScript('typeof window.getCurrentGameState === "function"', (error: Error, result: string) => {
        if (error || result === 'false') {
          console.error('getCurrentGameState函数不存在，将使用缓存数据');
          // 如果函数不存在，使用缓存的游戏状态
          const cachedState: GameState | null = GameStateManager.getCurrentGameState();
          if (cachedState) {
            resolve(cachedState);
          } else {
            reject(new Error('getCurrentGameState函数不存在且无缓存数据'));
          }
          return;
        }

        // 函数存在，调用它
        ctrl.runJavaScript('window.getCurrentGameState()', (error2: Error, result2: string) => {
          if (error2) {
            console.error('获取游戏状态失败: ' + error2.message);
            reject(error2);
          } else {
            console.info('获取游戏状态成功: ' + result2);
            try {
              // 尝试将结果解析为JSON对象
              const gameState: GameState = JSON.parse(result2) as GameState;
              // 实时更新到GameStateManager
              GameStateManager.updateGameState(gameState);
              resolve(gameState);
            } catch (e) {
              console.error('解析游戏状态失败: ' + JSON.stringify(e));
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
      const bpObj: Record<string, string | number> = {
        'breakpoint': this.currentBreakpoint,
        'orientation': this.orientation,
        'width': this.windowWidth,
        'height': this.windowHeight
      };
      const breakpointData: string = JSON.stringify(bpObj);
      try {
        const jsCode: string = '(function(){ try { window.__breakpointData = ' + breakpointData +
          '; if(window.document.readyState==="complete" && typeof initCanvas==="function"){' +
          ' initCanvas(); if(typeof snake !== "undefined" && snake.length > 0 && typeof gameStarted !== "undefined" && !gameStarted){ draw(); }' +
          ' } } catch(e){ console.error("bp inj err:", e); } })()';
        this.webController.runJavaScript(
          jsCode,
          (error: Error, result: string) => {
            if (error) {
              console.error('注入断点信息到H5失败: ' + error.message);
            }
          }
        );
      } catch (runJsError) {
        console.error('runJavaScript 调用异常（WebView可能未就绪）: ' + JSON.stringify(runJsError));
      }
    } catch (e) {
      console.error('injectBreakpointToH5 异常: ' + JSON.stringify(e));
    }
  }

  aboutToAppear() {
    const ctrl: webview.WebviewController = this.webController;

    // 添加显示游戏结束弹窗的事件监听
    EventBus.on(EventTopic.SHOW_GAME_OVER_DIALOG, () => {
      console.info('收到显示游戏结束弹窗的事件');
      ctrl.runJavaScript('window.showGameOverDialog && window.showGameOverDialog()', (error: Error, result: string) => {
        if (error) {
          console.error('显示游戏结束弹窗失败: ' + error.message);
        } else {
          console.info('游戏结束弹窗显示成功');
        }
      });
    });

    // 检查是否有来自应用接续的数据
    try {
      const restoredData: GameData | null = AppStorage.Get<GameData>('restoredGameData') as GameData | null;
      if (restoredData !== null) {
        console.info('检测到应用接续数据');
        this.restoredGameData = restoredData;
        this.isGameDataRestored = true;
        AppStorage.Delete('restoredGameData');
      }
    } catch (err) {
      console.error('处理应用接续数据失败: ' + JSON.stringify(err));
    }

    // 注册事件监听
    EventBus.on(EventTopic.INIT_GAME_DATA, (gameData: GameData) => {
      console.info('WebViewPage收到初始化游戏数据事件');
      if (ctrl) {
        this.initGameData(gameData);
      } else {
        console.error('WebController尚未初始化，无法初始化游戏数据');
      }
    });

    // 监听获取游戏状态请求
    EventBus.on(EventTopic.GET_GAME_STATE, async () => {
      console.info('WebViewPage收到获取游戏状态请求');
      try {
        const gameState: GameState = await this.getCurrentGameState();
        console.info('成功获取游戏状态，发送结果事件');
        EventBus.emit(EventTopic.GAME_STATE_RESULT, gameState);
      } catch (err) {
        console.error('获取游戏状态失败: ' + JSON.stringify(err));
        const cachedState: GameState | null = GameStateManager.getCurrentGameState();
        if (cachedState) {
          console.info('使用缓存的游戏状态');
          EventBus.emit(EventTopic.GAME_STATE_RESULT, cachedState);
        } else {
          EventBus.emit(EventTopic.GAME_STATE_RESULT, null);
        }
      }
    });

    // 监听游戏结束事件
    EventBus.on(EventTopic.GAME_OVER, (event: GameOverEvent) => {
      console.info('WebViewPage收到游戏结束事件，分数: ' + String(event.score));

      this.getCurrentGameState().then((gameState: GameState) => {
        console.info('游戏结束时，已保存最新游戏状态: ' + JSON.stringify(gameState));
      }).catch((err: Error) => {
        console.error('游戏结束时获取状态失败: ' + JSON.stringify(err));
      });
    });

    // 监听管理员 AI 请求事件（H5 → 原生转发）
    const wc: webview.WebviewController = this.webController;
    EventBus.on(EventTopic.ADMIN_AI_REQUEST, (rawData: AdminRequestRaw) => {
      console.info('WebViewPage 收到管理员AI请求，开始调用 DeepSeek...');
      const requestObj: AdminRequestRaw = rawData as AdminRequestRaw;

      // 异步处理 AI 请求
      this.processAdminAIRequest(requestObj, wc);
    });


    // 文件复制与碰一碰分享注册
    const ctx: common.UIAbilityContext = getContext(this) as common.UIAbilityContext;
    const filesDir: string = ctx.filesDir;
    try {
      const mediaResource: Uint8Array = ctx.resourceManager.getMediaContentSync($r('app.media.share')) as Uint8Array;
      const filePath: string = filesDir + '/share.png';
      const file: fs.File = fs.openSync(filePath, fs.OpenMode.READ_WRITE | fs.OpenMode.CREATE);
      const writeLen: number = fs.writeSync(file.fd, mediaResource.buffer);
      hilog.info(DOMAIN, TAG, 'write data to file succeed and size is:' + String(writeLen));
      fs.closeSync(file);
    } catch (error) {
      hilog.warn(DOMAIN, TAG, '媒体文件复制失败（模拟器可能不支持文件操作，碰一碰分享功能不可用）: ' + JSON.stringify(error));
    }
    try {
      harmonyShare.on('knockShare', this.purityCallback);
    } catch (error) {
      hilog.error(DOMAIN, TAG, '注册碰一碰分享失败（模拟器可能不支持）: ' + JSON.stringify(error));
    }
  }

  private purityCallback(sharableTarget: harmonyShare.SharableTarget): void {
    hilog.info(DOMAIN, TAG, 'knockShare 分享数据');
    const contextFaker: Context = getContext(this);
    const filePath: string = contextFaker.filesDir + '/share.png';
    const gameDataString: string = JSON.stringify(GameStateManager.getCurrentGameState());
    const shareData: systemShare.SharedData = new systemShare.SharedData({
      utd: utd.UniformDataType.HYPERLINK,
      content: 'https://boostfield.com/snakeapp/.well-known/applinking.json?data=' + encodeURIComponent(gameDataString),
      thumbnailUri: fileUri.getUriFromPath(filePath)
    });
    sharableTarget.share(shareData);
  }

  private async processAdminAIRequest(requestObj: AdminRequestRaw, wc: webview.WebviewController): Promise<void> {
    try {
      // 构造 AdminAIRequest
      const aiReq: AdminAIRequest = new AdminAIRequest();
      aiReq.userMessage = requestObj.userMessage ? requestObj.userMessage : '请根据当前状态给出建议';
      aiReq.grantedCommands = requestObj.grantedCommands;
      aiReq.sessionId = requestObj.sessionId;
      aiReq.gameContext = requestObj.gameContext;

      // 调用 DeepSeekService
      const aiResult: AdminQuestion = await DeepSeekService.askAdmin(aiReq);

      // 将结果回传给 H5
      const resultJson: string = JSON.stringify(aiResult);
      console.info('DeepSeek 返回结果: ' + resultJson.substring(0, 200) + '...');

      wc.runJavaScript(
        '(function(){ try { if(window.__admin__ && window.__admin__.onAIResponse){ window.__admin__.onAIResponse(' + resultJson + '); } } catch(e){ console.error("admin callback err:", e); } })()',
        (jsError: Error, jsResult: string) => {
          if (jsError) {
            console.error('回传AI结果到H5失败: ' + jsError.message);
          } else {
            console.info('AI结果已成功回传H5');
          }
        }
      );
    } catch (err) {
      console.error('管理员AI请求处理失败: ' + JSON.stringify(err));

      // 发送错误回 H5
      const fallback: AdminQuestion = new AdminQuestion();
      fallback.question = 'AI 暂时无法响应';
      const skipOpt: AdminOption = new AdminOption();
      skipOpt.label = '继续游戏';
      skipOpt.action = 'skip';
      skipOpt.params = {} as Record<string, string>;
      skipOpt.description = '不执行任何操作';
      fallback.options = [skipOpt];
      const errorJson: string = JSON.stringify(fallback);
      wc.runJavaScript(
        '(function(){ try { if(window.__admin__ && window.__admin__.onAIResponse){ window.__admin__.onAIResponse(' + errorJson + '); } } catch(e){} })()'
      );
    }
  }

  aboutToDisappear() {
    // 取消所有事件监听
    EventBus.off(EventTopic.INIT_GAME_DATA);
    EventBus.off(EventTopic.GET_GAME_STATE);
    EventBus.off(EventTopic.GAME_OVER);
    
    // 释放分布式资源相关的清理工作
    try {
      harmonyShare.off('knockShare', this.purityCallback);
    } catch (err) {
      hilog.error(DOMAIN, TAG, '注销碰一碰分享失败（模拟器可能不支持）: ' + JSON.stringify(err));
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
        methodList: ['gameOver', 'updateGameState', 'callDeepSeek', 'requestTransfer'],
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