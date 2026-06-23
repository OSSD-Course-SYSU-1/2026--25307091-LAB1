import { http } from '@kit.NetworkKit';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0000;
const TAG = 'DeepSeekService';

// ==================== 配置 ====================
const DEEPSEEK_API_KEY: string = 'sk-26b1f7f51b704146b4faf21f91ddab76';
const DEEPSEEK_API_URL: string = 'https://api.deepseek.com/chat/completions';
const REQUEST_TIMEOUT_MS: number = 15000;

// ==================== 类型定义 ====================

class GameContext {
  score: number = 0;
  level: number = 0;
  snakeLength: number = 0;
  elapsedSeconds: number = 0;
  learningParams: Record<string, number> = {};
  foodsCount: number = 0;
  gameSpeed: number = 400;
}

class AdminAIRequest {
  userMessage: string = '';
  gameContext: GameContext = new GameContext();
  grantedCommands: string[] = [];
  sessionId: string = '';
}

interface DeepSeekMessage {
  role: string;
  content: string;
}

interface DeepSeekChoiceMessage {
  content: string;
}

interface DeepSeekChoice {
  message: DeepSeekChoiceMessage;
}

interface DeepSeekResponse {
  choices: DeepSeekChoice[];
}

export class AdminOption {
  label: string = '';
  action: string = '';
  params: Record<string, string> = {};
  description: string = '';
}

export class AdminQuestion {
  question: string = '';
  options: AdminOption[] = [];
}

class HttpRequestOptions {
  method: http.RequestMethod = http.RequestMethod.POST;
  header: Record<string, string> = {} as Record<string, string>;
  extraData: string = '';
  connectTimeout: number = 15000;
  readTimeout: number = 15000;
}

// ==================== System Prompt ====================

function buildSystemPrompt(grantedCommands: string[], gameContext: GameContext): string {
  const cmdList: string = grantedCommands.join(', ');

  return '你是"蛇吃蛇游戏"的临时管理员，以问答形式与玩家互动。\n\n' +
    '## 当前授权命令（仅限本局）\n' + cmdList + '\n\n' +
    '## 命令说明\n' +
    '- spawn_food: 在屏幕上生成食物。params: { type: "normal"|"shrink", count?: number }\n' +
    '- set_speed: 调整游戏速度。params: { speed: number }  (100=快, 600=慢)\n' +
    '- grow_snake: 增长蛇身。params: { segments: number }\n' +
    '- shrink_snake: 缩短蛇身。params: { segments: number }\n' +
    '- toggle_invincible: 切换无敌模式。params: {}\n' +
    '- get_stats: 只读查询，不修改游戏。params: {}\n' +
    '- broadcast: 在游戏画布上显示一条消息。params: { message: string }\n\n' +
    '## 当前游戏状态\n' +
    '- 玩家分数: ' + gameContext.score + '\n' +
    '- 当前等级: Lv.' + gameContext.level + '\n' +
    '- 蛇身长度: ' + gameContext.snakeLength + ' 节\n' +
    '- 已进行: ' + gameContext.elapsedSeconds + ' 秒\n' +
    '- 游戏速度: ' + gameContext.gameSpeed + 'ms/步\n' +
    '- 屏幕上食物数: ' + gameContext.foodsCount + '\n' +
    '- AI学习参数: ' + JSON.stringify(gameContext.learningParams) + '\n\n' +
    '## 重要规则\n' +
    '1. 你不能修改玩家的分数（score）和最高分（highScore）\n' +
    '2. 你只能在上述授权命令中选择执行\n' +
    '3. 本局结束后你的所有修改都会被自动撤销\n' +
    '4. 你的回答必须是严格的 JSON 格式，不要有任何额外文字\n' +
    '5. 提出 2~3 个选项给玩家选择，包含一个"跳过/不用了"选项\n' +
    '6. 根据游戏状态给出有意义的建议（状态好则加大难度挑战，状态差则提供帮助）\n\n' +
    '## 回答格式（严格 JSON）\n' +
    '{\n' +
    '  "question": "你的问题文字",\n' +
    '  "options": [\n' +
    '    { "label": "选项A", "action": "命令名", "params": {}, "description": "简短说明" },\n' +
    '    { "label": "不用了，继续游戏", "action": "skip", "params": {}, "description": "不执行任何操作" }\n' +
    '  ]\n' +
    '}\n\n' +
    '请基于玩家当前状态，给出合适的问答。';
}

// ==================== HTTP 请求 ====================

function callDeepSeekAPI(systemPrompt: string, userMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const httpRequest: http.HttpRequest = http.createHttp();

      const systemMsg: DeepSeekMessage = { role: 'system', content: systemPrompt };
      const userMsg: DeepSeekMessage = { role: 'user', content: userMessage };
      const messages: DeepSeekMessage[] = [systemMsg, userMsg];

      const responseFormatObj: Record<string, string> = { 'type': 'json_object' };
      const requestBodyObj: Record<string, Object> = {
        'model': 'deepseek-chat',
        'messages': messages,
        'temperature': 0.7,
        'max_tokens': 800,
        'response_format': responseFormatObj
      };
      const requestBody: string = JSON.stringify(requestBodyObj);

      const authHeader: string = 'Bearer ' + DEEPSEEK_API_KEY;
      const headerObj: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      };
      const options: HttpRequestOptions = new HttpRequestOptions();
      options.header = headerObj;
      options.extraData = requestBody;
      options.connectTimeout = REQUEST_TIMEOUT_MS;
      options.readTimeout = REQUEST_TIMEOUT_MS;

      httpRequest.request(
        DEEPSEEK_API_URL,
        options,
        (err: Error, data: http.HttpResponse) => {
          if (err) {
            hilog.error(DOMAIN, TAG, 'DeepSeek API 请求失败: ' + JSON.stringify(err));
            reject(new Error('网络请求失败: ' + err.message));
            return;
          }

          try {
            const responseStr: string = data.result as string;
            hilog.info(DOMAIN, TAG, 'DeepSeek API 响应: ' + responseStr.substring(0, 200) + '...');

            const response: DeepSeekResponse = JSON.parse(responseStr) as DeepSeekResponse;
            if (response.choices && response.choices.length > 0) {
              resolve(response.choices[0].message.content);
            } else {
              reject(new Error('AI 未返回有效内容'));
            }
          } catch (parseError) {
            hilog.error(DOMAIN, TAG, '解析 DeepSeek 响应失败: ' + JSON.stringify(parseError));
            reject(new Error('解析 AI 响应失败'));
          }
        }
      );
    } catch (e) {
      hilog.error(DOMAIN, TAG, '创建 HTTP 请求失败: ' + JSON.stringify(e));
      reject(new Error('创建网络请求失败（模拟器可能不支持）'));
    }
  });
}

// ==================== 公开接口 ====================

export class DeepSeekService {
  private static isProcessing: boolean = false;

  static async askAdmin(request: AdminAIRequest): Promise<AdminQuestion> {
    if (DeepSeekService.isProcessing) {
      throw new Error('AI 正在处理上一个请求，请稍候');
    }

    DeepSeekService.isProcessing = true;
    hilog.info(DOMAIN, TAG, '收到管理员AI请求: "' + request.userMessage.substring(0, 50) + '..."');

    try {
      const systemPrompt: string = buildSystemPrompt(request.grantedCommands, request.gameContext);
      const aiResponseText: string = await callDeepSeekAPI(systemPrompt, request.userMessage);

      let jsonStr: string = aiResponseText.trim();

      // 去除可能的 Markdown 代码块包装
      const jsonMatch: RegExpMatchArray | null = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed: AdminQuestion = JSON.parse(jsonStr) as AdminQuestion;

      // 验证必要字段
      if (!parsed.question || !Array.isArray(parsed.options) || parsed.options.length === 0) {
        throw new Error('AI 返回格式无效：缺少 question 或 options');
      }

      // 过滤不在授权列表中的命令
      const validCommands: Set<string> = new Set(request.grantedCommands);
      const filteredOptions: AdminOption[] = [];
      for (let i = 0; i < parsed.options.length; i++) {
        const opt: AdminOption = parsed.options[i];
        if (opt.action === 'skip' || validCommands.has(opt.action)) {
          filteredOptions.push(opt);
        }
      }
      parsed.options = filteredOptions;

      // 确保至少有一个 skip 选项
      let hasSkip: boolean = false;
      for (let i = 0; i < parsed.options.length; i++) {
        if (parsed.options[i].action === 'skip') {
          hasSkip = true;
          break;
        }
      }
      if (!hasSkip) {
        const skipOption: AdminOption = new AdminOption();
        skipOption.label = '不用了';
        skipOption.action = 'skip';
        skipOption.params = {};
        skipOption.description = '不执行任何操作，继续游戏';
        parsed.options.push(skipOption);
      }

      hilog.info(DOMAIN, TAG, 'AI 问答解析成功: ' + parsed.question);
      return parsed;
    } catch (error) {
      hilog.error(DOMAIN, TAG, 'DeepSeekService 处理失败: ' + JSON.stringify(error));
      return DeepSeekService.getFallbackQuestion(request);
    } finally {
      DeepSeekService.isProcessing = false;
    }
  }

  private static getFallbackQuestion(request: AdminAIRequest): AdminQuestion {
    const cmds: string[] = request.grantedCommands;
    const options: AdminOption[] = [];

    if (cmds.indexOf('spawn_food') >= 0) {
      const opt: AdminOption = new AdminOption();
      opt.label = '生成一个食物';
      opt.action = 'spawn_food';
      opt.params = { 'type': 'normal', 'count': '1' };
      opt.description = '在随机位置生成普通食物';
      options.push(opt);
    }
    if (cmds.indexOf('grow_snake') >= 0) {
      const opt: AdminOption = new AdminOption();
      opt.label = '蛇身 +2 节';
      opt.action = 'grow_snake';
      opt.params = { 'segments': '2' };
      opt.description = '让蛇变长 2 节';
      options.push(opt);
    }
    if (cmds.indexOf('set_speed') >= 0) {
      const opt: AdminOption = new AdminOption();
      opt.label = '稍微加速';
      opt.action = 'set_speed';
      const newSpeed: number = Math.max(100, request.gameContext.gameSpeed - 60);
      opt.params = { 'speed': String(newSpeed) };
      opt.description = '游戏速度略微加快';
      options.push(opt);
    }

    const skipOption: AdminOption = new AdminOption();
    skipOption.label = '不用了';
    skipOption.action = 'skip';
    skipOption.params = {};
    skipOption.description = '继续游戏';
    options.push(skipOption);

    const result: AdminQuestion = new AdminQuestion();
    result.question = '（AI 离线）要做什么调整吗？';
    result.options = options;
    return result;
  }

  static isConfigured(): boolean {
    return DEEPSEEK_API_KEY.length > 0 &&
           DEEPSEEK_API_KEY !== 'sk-your-deepseek-api-key-here';
  }
}

export { AdminAIRequest, GameContext };
