# Vercel 部署

像序当前是纯静态 HTML/CSS/JavaScript 项目，没有 `package.json`、构建步骤或前端路由。

生产项目：`xiangxu`

正式地址：<https://xiangxu.vercel.app>

## 项目设置

- Framework Preset：`Other`
- Root Directory：仓库根目录
- Install Command：留空
- Build Command：留空
- Output Directory：留空
- Production Branch：`main`

根目录的 `index.html` 是部署入口。项目没有子路由，因此不需要 `vercel.json` SPA rewrite。

## 部署后验收

- 检查 `index.html`、CSS、Worker、ONNX Runtime JavaScript 和 WASM 均返回 200。
- 确认控制台没有未处理错误，中文没有乱码。
- 在 Chrome 和 Edge 中分别复测导入、预览、预设和批量 ZIP 导出。
- 确认 PP-MattingV2 显示为未安装，而不是请求不存在的模型后崩溃。
- 测试 PP-MattingV2 与 u2netp 在断网状态下均能识别为内置模型；第三方模型链接可能受网络策略影响，但不得影响基础处理。
- Vercel 不应承载 AI 推理或接收用户图片；推理仍在浏览器 CPU/WASM 中执行。

`.vercel/` 只包含本机项目绑定信息，已由 `.gitignore` 排除。

## 当前验收状态

- Vercel 控制面显示生产部署为 Ready。
- 用户已确认正式地址可从其网络环境打开。
- 当前自动化执行环境连接 `*.vercel.app` 超时，因此仍需在可访问网络中复核浏览器控制台和完整图片处理、导出交互。
