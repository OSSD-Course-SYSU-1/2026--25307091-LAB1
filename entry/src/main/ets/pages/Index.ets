import router from '@ohos.router';
import { hilog } from '@kit.PerformanceAnalysisKit';

const DOMAIN = 0x0000;
const TAG = 'Index';

@Entry
@Component
struct Index {
  @State message: string = 'Hello World';
  @StorageProp('gameTitle') gameTitle: string = '未接收到游戏标题';
  @StorageLink('currentBreakpoint') currentBreakpoint: string = 'sm';
  @StorageLink('orientation') orientation: string = 'portrait';

  aboutToAppear() {
    AppStorage.SetOrCreate('gameTitle', 'Genji掘金大冒险');
    hilog.info(DOMAIN, TAG, `页面加载，断点: ${this.currentBreakpoint}, 方向: ${this.orientation}`);
  }

  build() {
    Column() {
      if (this.currentBreakpoint === 'sm') {
        // ===== 手机布局 =====
        Column() {
          RelativeContainer() {
            Button('开始游戏')
              .fontSize(18)
              .fontWeight(FontWeight.Bold)
              .onClick(() => {
                router.push({ url: 'pages/WebViewPage' });
              })
              .alignRules({
                center: { anchor: '__container__', align: VerticalAlign.Center },
                middle: { anchor: '__container__', align: HorizontalAlign.Center }
              })
          }
          .height('50%')
          .width('100%')

          Text(`游戏标题: ${this.gameTitle}`)
            .fontSize(20)
            .margin({ top: 20 })
        }
        .height('100%')
        .width('100%')
      } else {
        // ===== 平板/2in1 布局 =====
        Row() {
          // 左侧：游戏介绍
          Column() {
            Text('🐍')
              .fontSize(64)
              .margin({ bottom: 16 })

            Text('Genji掘金大冒险')
              .fontSize(28)
              .fontWeight(FontWeight.Bold)
              .margin({ bottom: 12 })

            Text('经典贪吃蛇游戏')
              .fontSize(16)
              .fontColor('#8899AA')
              .margin({ bottom: 8 })

            Text('• 控制蛇吃食物，不断变长')
              .fontSize(14)
              .fontColor('#99AABB')
              .margin({ bottom: 4 })
            Text('• 撞墙后会尝试跨设备继续')
              .fontSize(14)
              .fontColor('#99AABB')
              .margin({ bottom: 4 })
            Text('• 支持手机/平板/车机多端')
              .fontSize(14)
              .fontColor('#99AABB')
              .margin({ bottom: 24 })

            Button('开始游戏')
              .fontSize(20)
              .fontWeight(FontWeight.Bold)
              .padding({ left: 48, right: 48, top: 16, bottom: 16 })
              .onClick(() => {
                router.push({ url: 'pages/WebViewPage' });
              })
          }
          .width('50%')
          .height('100%')
          .justifyContent(FlexAlign.Center)
          .padding(32)

          // 右侧：装饰区域
          Column() {
            Text('🎮')
              .fontSize(120)
              .opacity(0.3)
          }
          .width('50%')
          .height('100%')
          .justifyContent(FlexAlign.Center)
          .backgroundColor('#F0F4F8')
        }
        .height('100%')
        .width('100%')
      }
    }
    .height('100%')
    .width('100%')
  }
}