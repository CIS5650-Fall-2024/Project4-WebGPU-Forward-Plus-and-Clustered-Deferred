struct ProjectionUniforms {
  matrix : mat4x4<f32>,
  inverseMatrix : mat4x4<f32>,
  outputSize : vec2<f32>,
  zNear : f32,
  zFar : f32
};
@group(0) @binding(0) var<uniform> projection : ProjectionUniforms;
    
const tileCount : vec3<u32> = vec3<u32>(32u, 18u, 48u);

fn linearDepth(depthSample : f32) -> f32 {
  return projection.zFar*projection.zNear / fma(depthSample, projection.zNear-projection.zFar, projection.zFar);
}

fn getTile(fragCoord : vec4<f32>) -> vec3<u32> {
  // TODO: scale and bias calculation can be moved outside the shader to save cycles.
  let sliceScale = f32(tileCount.z) / log2(projection.zFar / projection.zNear);
  let sliceBias = -(f32(tileCount.z) * log2(projection.zNear) / log2(projection.zFar / projection.zNear));
  let zTile = u32(max(log2(linearDepth(fragCoord.z)) * sliceScale + sliceBias, 0.0));

  return vec3<u32>(u32(fragCoord.x / (projection.outputSize.x / f32(tileCount.x))),
                   u32(fragCoord.y / (projection.outputSize.y / f32(tileCount.y))),
                   zTile);
}

fn getClusterIndex(fragCoord : vec4<f32>) -> u32 {
  let tile = getTile(fragCoord);
  return tile.x +
         tile.y * tileCount.x +
         tile.z * tileCount.x * tileCount.y;
}


var<private> colorSet : array<vec3<f32>, 9> = array<vec3<f32>, 9>(
  vec3<f32>(1.0, 0.0, 0.0),
  vec3<f32>(1.0, 0.5, 0.0),
  vec3<f32>(0.5, 1.0, 0.0),
  vec3<f32>(0.0, 1.0, 0.0),
  vec3<f32>(0.0, 1.0, 0.5),
  vec3<f32>(0.0, 0.5, 1.0),
  vec3<f32>(0.0, 0.0, 1.0),
  vec3<f32>(0.5, 0.0, 1.0),
  vec3<f32>(1.0, 0.0, 0.5)
);

@fragment
fn main(@builtin(position) fragCoord : vec4<f32>) -> @location(0) vec4<f32> {
  var tile : vec3<u32> = getTile(fragCoord);
  return vec4<f32>(colorSet[tile.z % 9u], 1.0);
}
  