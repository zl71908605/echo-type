/**
 * 品牌标识集中定义。改品牌名时只改这里，避免全库散落字符串。
 *
 * 注意：内部标识符不随品牌名变更——localStorage 前缀、Dexie 数据库名、
 * Tauri identifier、iOS bundle id、`echotype://` 深链协议、`window.EchoTypeNative`
 * 桥接对象都保持原样，否则会丢用户数据或断掉老版本更新链路。
 */
export const BRAND = {
  /** 中文品牌名，中文界面与中文文档使用 */
  nameZh: '小步',
  /** 英文品牌名，英文界面、安装包名与仓库名使用 */
  nameEn: 'StepUp',
  /** 侧边栏副标 */
  tagline: 'STEP BY STEP',
} as const;

/** 当前界面语言下应显示的品牌名 */
export function brandName(locale: string | undefined): string {
  return locale?.startsWith('zh') ? BRAND.nameZh : BRAND.nameEn;
}
