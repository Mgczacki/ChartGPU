// pie.wgsl
// Instanced anti-aliased pie-slice shader (instanced quad + SDF mask).
//
// - Per-instance vertex input:
//   - center        = vec2<f32> slice center (transformed by VSUniforms.transform)
//   - radiusPx      = f32 outer radius in *device pixels*
//   - startAngleRad = f32 start angle in radians
//   - endAngleRad   = f32 end angle in radians
//   - color         = vec4<f32> RGBA color in [0..1]
//
// - Draw call: draw(6, instanceCount) using triangle-list expansion in VS
//
// - Uniforms:
//   - @group(0) @binding(0): VSUniforms { transform, viewportPx }
//
// Notes:
// - The quad is expanded in clip space using `radiusPx` and `viewportPx`.
// - Fragment uses an SDF mask for the circle boundary + an angular wedge mask.
// - Fully outside fragments are discarded to avoid unnecessary blending work.
//
// Conventions: matches other shaders in this repo (vsMain/fsMain, group 0 bindings,
// and explicit uniform padding/alignment where needed).

const PI: f32 = 3.141592653589793;
const TAU: f32 = 6.283185307179586; // 2*pi

struct VSUniforms {
  transform: mat4x4<f32>,
  viewportPx: vec2<f32>,
  // Pad to 16-byte alignment (mat4x4 is 64B; vec2 adds 8B; pad to 80B).
  _pad0: vec2<f32>,
};

@group(0) @binding(0) var<uniform> vsUniforms: VSUniforms;

struct VSIn {
  @location(0) center: vec2<f32>,
  @location(1) radiusPx: f32,
  @location(2) startAngleRad: f32,
  @location(3) endAngleRad: f32,
  @location(4) color: vec4<f32>,
};

struct VSOut {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) localPx: vec2<f32>,
  @location(1) radiusPx: f32,
  @location(2) startAngleRad: f32,
  @location(3) endAngleRad: f32,
  @location(4) color: vec4<f32>,
};

@vertex
fn vsMain(in: VSIn, @builtin(vertex_index) vertexIndex: u32) -> VSOut {
  // Fixed local corners for 2 triangles (triangle-list).
  // `localNdc` is a quad in [-1, 1]^2; we convert it to pixel offsets via radiusPx.
  let localNdc = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );

  let corner = localNdc[vertexIndex];
  let localPx = corner * in.radiusPx;

  // Convert pixel offset to clip-space offset.
  // Clip space spans [-1, 1] across the viewport, so px -> clip is (2 / viewportPx).
  let localClip = localPx * (2.0 / vsUniforms.viewportPx);

  let centerClip = (vsUniforms.transform * vec4<f32>(in.center, 0.0, 1.0)).xy;

  var out: VSOut;
  out.clipPosition = vec4<f32>(centerClip + localClip, 0.0, 1.0);
  out.localPx = localPx;
  out.radiusPx = in.radiusPx;
  out.startAngleRad = in.startAngleRad;
  out.endAngleRad = in.endAngleRad;
  out.color = in.color;
  return out;
}

fn wrapAngle0ToTau(theta: f32) -> f32 {
  // Maps theta to [0, TAU). Works for any finite theta.
  // NOTE: WGSL `fract(x)` returns x - floor(x), so `fract(theta / TAU)` is [0,1).
  return fract(theta / TAU) * TAU;
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4<f32> {
  // Circle SDF (negative inside).
  let circleDist = length(in.localPx) - in.radiusPx;
  let circleW = fwidth(circleDist);
  let circleA = 1.0 - smoothstep(0.0, circleW, circleDist);

  if (circleA <= 0.0) {
    discard;
  }

  // Compute fragment angle in [0, TAU).
  var angle = atan2(in.localPx.y, in.localPx.x);
  if (angle < 0.0) {
    angle = angle + TAU;
  }

  // Wedge mask, robust to wrap-around (start > end).
  let start = wrapAngle0ToTau(in.startAngleRad);
  let rawDelta = in.endAngleRad - in.startAngleRad;
  var span = wrapAngle0ToTau(rawDelta);

  // Heuristic: treat near-TAU spans as full circle (avoids the wrap-to-0 case).
  let isFullCircle = abs(rawDelta) >= (TAU - 1e-4);
  if (isFullCircle) {
    span = TAU;
  }

  // Relative angle from start in [0, TAU).
  let a = wrapAngle0ToTau(angle - start);

  // If span is exactly 0 (and not full circle), treat as empty slice.
  if (!isFullCircle && span <= 0.0) {
    discard;
  }

  // Approximate signed distance to wedge boundaries in *pixels*.
  // - inside: negative (distance to nearest boundary along arc length, ~theta * radius)
  // - outside: positive (distance to nearest boundary, along arc length)
  let r = max(0.0, length(in.localPx));
  let outside = (!isFullCircle) && (a > span);

  // Inside distance in theta-space to nearest boundary.
  let insideTheta = min(a, max(0.0, span - a));
  let outsideTheta = max(0.0, a - span);

  let wedgeDistPx = select(-(insideTheta * r), outsideTheta * r, outside);
  let wedgeW = fwidth(wedgeDistPx);
  let wedgeA = 1.0 - smoothstep(0.0, wedgeW, wedgeDistPx);

  let aOut = circleA * wedgeA;
  if (aOut <= 0.0) {
    discard;
  }

  return vec4<f32>(in.color.rgb, in.color.a * aOut);
}

