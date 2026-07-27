# Vercel 部署

像序当前是纯静态 HTML/CSS/JavaScript 项目，没有 `package.json`、构建步骤或前端路由。

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
- 测试 u2netp 下载失败和取消流程；第三方托管站点可能受网络或 CORS 策略影响。
- Vercel 不应承载 AI 推理或接收用户图片；推理仍在浏览器 CPU/WASM 中执行。

`.vercel/` 只包含本机项目绑定信息，已由 `.gitignore` 排除。
