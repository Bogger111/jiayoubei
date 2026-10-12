# MediaPipe 本地资源

本目录包含 `@mediapipe/tasks-vision` 1.0.1 的浏览器运行脚本与 WASM 文件，以及 Pose Landmarker Lite 模型。

- 运行库作者：Google MediaPipe，mediapipe@google.com
- 运行库许可：Apache License 2.0（包内 `package.json` 声明）
- 官方项目：https://github.com/google-ai-edge/mediapipe
- 姿态模型说明：https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker
- 模型来源：https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task

`pose-worker.js` 为本项目的后台推理入口。`vision_bundle.js` 与 `wasm/` 中的运行库来自安装包，作为第三方资源保留。
