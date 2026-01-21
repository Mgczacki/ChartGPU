// candlestick.wgsl
// Instanced candlestick shader (bodies + wicks):
// - Per-instance vertex input:
//   - xClip, openClip, closeClip, lowClip, highClip, bodyWidthClip (6 floats)
//   - bodyColor rgba (4 floats)
// - Draw call: draw(18, instanceCount) using triangle-list expansion in VS
//   - vertices 0-5: body quad (2 triangles)
//   - vertices 6-11: upper wick (2 triangles)
//   - vertices 12-17: lower wick (2 triangles)
// - Uniforms:
//   - @group(0) @binding(0): VSUniforms { transform, wickWidthClip }

struct VSUniforms {
  transform: mat4x4<f32>,
  wickWidthClip: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> vsUniforms: VSUniforms;

struct VSIn {
  @location(0) xClip: f32,
  @location(1) openClip: f32,
  @location(2) closeClip: f32,
  @location(3) lowClip: f32,
  @location(4) highClip: f32,
  @location(5) bodyWidthClip: f32,
  @location(6) bodyColor: vec4<f32>,
};

struct VSOut {
  @builtin(position) clipPosition: vec4<f32>,
  @location(0) color: vec4<f32>,
};

@vertex
fn vsMain(in: VSIn, @builtin(vertex_index) vertexIndex: u32) -> VSOut {
  // Compute body bounds
  let bodyTop = max(in.openClip, in.closeClip);
  let bodyBottom = min(in.openClip, in.closeClip);
  let bodyLeft = in.xClip - in.bodyWidthClip * 0.5;
  let bodyRight = in.xClip + in.bodyWidthClip * 0.5;

  // Wick bounds
  let wickLeft = in.xClip - vsUniforms.wickWidthClip * 0.5;
  let wickRight = in.xClip + vsUniforms.wickWidthClip * 0.5;

  var pos: vec2<f32>;

  if (vertexIndex < 6u) {
    // Body quad (vertices 0-5)
    let corners = array<vec2<f32>, 6>(
      vec2<f32>(0.0, 0.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(1.0, 1.0)
    );
    let corner = corners[vertexIndex];
    let bodyMin = vec2<f32>(bodyLeft, bodyBottom);
    let bodyMax = vec2<f32>(bodyRight, bodyTop);
    pos = bodyMin + corner * (bodyMax - bodyMin);
  } else if (vertexIndex < 12u) {
    // Upper wick (vertices 6-11): from bodyTop to highClip
    let idx = vertexIndex - 6u;
    let corners = array<vec2<f32>, 6>(
      vec2<f32>(0.0, 0.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(1.0, 1.0)
    );
    let corner = corners[idx];
    let wickMin = vec2<f32>(wickLeft, bodyTop);
    let wickMax = vec2<f32>(wickRight, in.highClip);
    pos = wickMin + corner * (wickMax - wickMin);
  } else {
    // Lower wick (vertices 12-17): from lowClip to bodyBottom
    let idx = vertexIndex - 12u;
    let corners = array<vec2<f32>, 6>(
      vec2<f32>(0.0, 0.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(0.0, 1.0),
      vec2<f32>(1.0, 0.0),
      vec2<f32>(1.0, 1.0)
    );
    let corner = corners[idx];
    let wickMin = vec2<f32>(wickLeft, in.lowClip);
    let wickMax = vec2<f32>(wickRight, bodyBottom);
    pos = wickMin + corner * (wickMax - wickMin);
  }

  var out: VSOut;
  out.clipPosition = vsUniforms.transform * vec4<f32>(pos, 0.0, 1.0);
  out.color = in.bodyColor;
  return out;
}

@fragment
fn fsMain(in: VSOut) -> @location(0) vec4<f32> {
  return in.color;
}
