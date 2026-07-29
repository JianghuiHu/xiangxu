# 内置 AI 模型

`ppmattingv2-stdc1-human-512.onnx` 由 PaddleSeg 官方 PP-MattingV2 部署模型转换而来：

- 官方部署包：`https://paddleseg.bj.bcebos.com/matting/models/deploy/ppmattingv2-stdc1-human_512.zip`
- 原始部署包 SHA-256：`DAFF48B08C61958B9A21093791F6AED8EB3939B34B7418E40C18B2348136893D`
- 转换：Paddle2ONNX 1.3.1，固定输入 `1×3×512×512`，ONNX opset 11
- 大小：35,940,680 bytes
- SHA-256：`8286b1a110360e868d54ad00319aaa12d5e7bba79ee42e057d67fa5baa8962ff`
- 原始模型：PP-MattingV2 / STDC1 / human 512
- 许可：Apache License 2.0，完整文本见 `PADDLESEG-LICENSE.txt`

该模型面向人像抠图，不应宣传为通用商品抠图模型。应用只在用户启用 AI 抠图时加载它；默认图片处理流程不启动 ONNX 推理，也不发起模型下载。

## 内置通用模型

`u2netp.onnx` 随产品内置，可在无网络环境下直接使用：

- 来源：`https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx`
- 大小：4,574,861 bytes
- SHA-256：`309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8`
- 许可：Apache License 2.0，见 `U2NET-LICENSE.txt`
