# bc-texture-codec

零第三方依赖、纯 CPU 实现的 Node.js **BC1 (DXT1)** 与 **BC3 (DXT5)** 纹理块编解码库，面向游戏离线资源构建管线。仅使用 Node.js 内置模块（`node:test`、`node:crypto`），不调用 GPU，也不包含任何原生或 npm 运行时依赖。

输入为 RGBA8 像素缓冲区（`Uint8Array`，每像素 4 字节）、宽、高和格式；输出为按块对齐的压缩数据。解码输出带显式行跨度（stride）的 RGBA8。

## 格式概览

- 图像被切分为 4×4 纹素块，不足 4 像素的边缘块按块编码，缺失纹素以边缘像素填充且不写回输出。
- **BC1**：每块 8 字节。两个 16-bit RGB565 小端端点 + 16 个 2-bit 调色板索引（共 32 位）。
  - 不透明模式（`c0 > c1`）：4 个不透明颜色，索引 2/3 为 2:1、1:2 插值。
  - 透明模式（`c0 <= c1`）：3 个颜色 + 1 个全透明项，索引 3 表示 alpha=0。
- **BC3**：每块 16 字节。前 8 字节是独立的 Alpha 块（两个 8-bit 端点 + 16 个 3-bit 索引），后 8 字节是 BC1 颜色块（始终按 4 色不透明模式解释，Alpha 由独立通道提供）。
  - `a0 > a1`：8 个插值 alpha。
  - `a0 <= a1`：6 个插值 alpha，索引 6/7 为保留的 0/255。
- 所有多字节字段均按小端读写；RGB565 位域为 R5/G6/B5，解码采用位复制（bit replication）扩展回 8 位。

## 端点配色模式

编码器在每个 4×4 块内选择 RGB 空间中距离最大的两个像素作为颜色端点，再量化到 RGB565。可通过 `colorMode` 选择：

- `bbox`（默认）：端点直接量化，覆盖块内完整颜色范围。
- `inset`：低端点在量化后向内收缩一个量化步长，为中间插值留出余量，部分渐变块误差更低，但两种模式各有适用场景，库不会把块退化成固定颜色。

## 安装与测试

```bash
npm test          # 运行 node:test 全套测试
node scripts/report.js   # 输出各测试图像的压缩率与 PSNR/Alpha 误差报告（CSV）
```

要求 Node.js >= 18（使用内置 `node:test` 与 ESM）。

## API

```js
import {
  encode, decode,
  encodeMipChain, decodeMipChain,
  compressedSize, compareImages, meanAlphaError,
  FORMAT,
} from 'bc-texture-codec';

const rgba = new Uint8Array(width * height * 4); // 填充 R,G,B,A...
const packed = encode(rgba, width, height, FORMAT.BC1, {
  colorMode: 'bbox',       // 'bbox' | 'inset'
  alphaThreshold: 128,     // BC1：alpha 小于该值视为透明
});

const { data, stride, width: w, height: h } = decode(packed, width, height, FORMAT.BC1, {
  stride: width * 4,       // 可选，自定义输出行跨度，须 >= width*4
});
```

- `encode(rgba, width, height, format, options?) -> Uint8Array`
- `decode(data, width, height, format, options?) -> { data, stride, width, height }`
- `encodeMipChain(rgba, width, height, format, levels?, options?) -> { data, levels }`
  - `levels` 为正整数（级数）或 `[[w,h], ...]` 显式描述符；内部用 2×2 盒式平均生成下级。
- `decodeMipChain(data, width, height, format, levels?, options?) -> Array<{ data, stride, width, height }>`
- `compressedSize(width, height, format) -> number`
- `compareImages(original, reconstructed, width, height, options?) -> { rgbMse, rgbaMse, rgbPsnr, rgbaPsnr }`
- `meanAlphaError(original, reconstructed, width, height, options?) -> number`

块级与底层函数（`encodeBC1Block`、`decodeBC1Block`、`encodeBC3Block`、`decodeAlphaBlock`、`toRGB565`、`fromRGB565`、`buildPalette`、`buildAlphaTable`）也从包入口导出，便于测试与自定义管线。

## 错误处理

所有参数错误抛出 `CodecError`（`Error` 子类），带稳定的 `code`：

| code | 触发条件 |
| --- | --- |
| `INVALID_DIMENSION` | 宽高不是正整数或为 0 |
| `DIMENSION_TOO_LARGE` | 单边超过 `MAX_DIMENSION`（32768） |
| `INVALID_FORMAT` | 格式不是 `BC1`/`BC3` |
| `INVALID_INPUT` | 像素/压缩数据不是 `Uint8Array` |
| `BUFFER_TOO_SMALL` | RGBA8 或压缩缓冲区字节数不足 |
| `INVALID_STRIDE` | stride 非正或小于 `width*4` |
| `INVALID_OPTION` | `colorMode`、`alphaThreshold` 等选项非法 |
| `INVALID_MIP` | mip 级数过多、尺寸不符合逐级减半规则或描述符非法 |

## 质量度量与已知边界

误差以 MSE 与 PSNR 报告（峰值 255，分别按 RGB 三通道与 RGBA 四通道计算），Alpha 另给平均绝对误差。`node scripts/report.js` 的代表性结果：

| 图像 | BC1 RGB PSNR | BC3 RGB PSNR | 压缩率 (BC1/BC3) |
| --- | --- | --- | --- |
| 纯色 | ~32.9 dB | ~32.9 dB | 8x / 4x |
| 颜色条（块内少色） | 无损 | 无损 | 8x / 4x |
| 随机块 | ~35 dB | ~35 dB | 8x / 4x |
| 多通道强渐变 | ~32 dB | ~26 dB | 8x / 4x |

已知格式级边界（非实现缺陷）：

- RGB565 每通道只有 5/6/5 位，纯色也存在量化误差，无法位精确还原。
- 单个 4×4 块只有 4 个颜色档位；块内同时存在多方向（如 R 与 G 独立）强渐变时，端点只能覆盖最远两点，中间色彩误差明显，PSNR 可能降到 10–20 dB。
- BC1 仅支持 1-bit 透明（全透或全不透明）；需要平滑半透明须使用 BC3，其 Alpha 为 3-bit/8 档量化，平均 Alpha 误差通常在数个灰度级内。
- 边缘块的补边纹素参与端点拟合但不会写回输出，因此非 4 倍数尺寸的有效像素质量与常规块一致。

## 项目结构

```
lib/
  constants.js   格式常量、块大小、最大尺寸
  errors.js      CodecError
  validate.js    参数校验、块计数、mip 尺寸规则
  rgb565.js      RGB565 量化/反量化与小端读写
  endpoints.js   块内端点拟合（bbox / inset）
  bc1.js         BC1 块编解码、调色板、2-bit 索引
  alpha.js       BC3 Alpha 块编解码、3-bit 索引
  bc3.js         BC3 块组合
  encode.js      整图/mip 编码、边缘块采集
  decode.js      整图/mip 解码、stride 输出
  metrics.js     MSE/PSNR/Alpha 误差
test/            node:test 测试与图像生成器
scripts/report.js  压缩质量 CSV 报告
```
