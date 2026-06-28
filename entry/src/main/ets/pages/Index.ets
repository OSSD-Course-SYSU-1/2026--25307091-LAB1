import router from '@ohos.router';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0000;
const TAG = 'Index';

@Entry
@Component
struct Index {
  @State message: string = 'Hello World';
  @StorageProp('gameTitle') gameTitle: string = '未接收到游戏标题';

  aboutToAppear() {
    hilog.info(DOMAIN, TAG, `页面加载，接收到的游戏标题: ${this.gameTitle}`);
  }

  build() {
    Column() {
      RelativeContainer() {
        // add a button to navigate to WebViewPage
        Button('Go to WebView')
          .fontSize($r('app.float.button_text_font_size'))
          .onClick(() => {
            router.push({
              url: 'pages/WebViewPage'
            });
          })
          .margin({ top: $r('app.float.button_margin_top') })
          .alignRules({
            center: { anchor: '__container__', align: VerticalAlign.Center },
            middle: { anchor: '__container__', align: HorizontalAlign.Center }
          });
      }
      .height('50%')
      .width('100%')

      // 显示从应用接续传递来的游戏标题
      Text(`游戏标题: ${this.gameTitle}`)
        .fontSize(20)
        .margin({ top: 20 })
    }
    .height('100%')
    .width('100%')
  }
}