// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(0) @binding(0) var<uniform> cameraUniforms : CameraUniforms;
@group(0) @binding(1) var<uniform> view : ViewUniforms;
@group(0) @binding(2) var<storage, read> lightSet: LightSet;
@group(0) @binding(3) var<storage, read_write> clusters : Clusters;
@group(0) @binding(4) var<storage, read_write> clusterLights : ClusterLightGroup;

@group(${bindGroup_Gbuffer}) @binding(0) var defultSampler: sampler;
@group(${bindGroup_Gbuffer}) @binding(1) var gbufferTexture: texture_2d<u32>;

fn linearDepth(depthSample : f32) -> f32 {
  return cameraUniforms.zFar*cameraUniforms.zNear / fma(depthSample, cameraUniforms.zNear-cameraUniforms.zFar, cameraUniforms.zFar);
}

fn getTile(fragCoord : vec4<f32>) -> vec3<u32> {
  // TODO: scale and bias calculation can be moved outside the shader to save cycles.
  let sliceScale = f32(tileCount.z) / log2(cameraUniforms.zFar / cameraUniforms.zNear);
  let sliceBias = -(f32(tileCount.z) * log2(cameraUniforms.zNear) / log2(cameraUniforms.zFar / cameraUniforms.zNear));
  let zTile = u32(max(log2(linearDepth(fragCoord.z)) * sliceScale + sliceBias, 0.0));

  return vec3<u32>(u32(fragCoord.x / (cameraUniforms.outputSize.x / f32(tileCount.x))),
                   u32(fragCoord.y / (cameraUniforms.outputSize.y / f32(tileCount.y))),
                   zTile);
}

fn getClusterIndex(fragCoord : vec4<f32>) -> u32 {
  let tile = getTile(fragCoord);
  return tile.x +
         tile.y * tileCount.x +
         tile.z * tileCount.x * tileCount.y;
}

struct Fragmentin
{
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f,
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

const tileCount : vec3<u32> = vec3<u32>(32u, 18u, 48u);
@fragment
fn main(in: Fragmentin) -> @location(0) vec4f {
    let texCoords = in.uv;
    let pixelPos: vec2<u32> = vec2<u32>(in.fragPos.xy);

    let packedData = textureLoad(gbufferTexture, pixelPos, 0);

    let diffuseColor = unpack4x8unorm(packedData.x);
    let unpackNor = unpack2x16unorm(packedData.y);
    var depth = bitcast<f32>(packedData.z);
    let normal = decodeNormal(unpackNor);

    let screenPos = vec4<f32>(in.fragPos.xy, depth, 1.0);
    let clipPos = vec4<f32>(vec2<f32>(screenPos.x, cameraUniforms.outputSize.y - screenPos.y) * 2.0 / cameraUniforms.outputSize - 1.0, screenPos.z, 1.0);
    var worldPos = cameraUniforms.inverseProjMatrix * clipPos;
    worldPos /= vec4<f32>(worldPos.w, worldPos.w, worldPos.w, worldPos.w); 
    worldPos = view.invViewMatrix * worldPos;

    //return vec4<f32>(worldPos.xyz, 1.0);

    var totalLightContrib = vec3f(0, 0, 0);
    let clusterIndex = getClusterIndex(screenPos);
    let lightOffset  = clusterLights.lights[clusterIndex].offset;
    let lightCount   = clusterLights.lights[clusterIndex].count;

    //return vec4<f32>(vec3<f32>(f32(lightCount))/100.0, 1.0);

    for (var lightIndex = 0u; lightIndex < lightCount; lightIndex = lightIndex + 1u) {
        let i = clusterLights.indices[lightOffset + lightIndex];
        let light = lightSet.lights[i];
        totalLightContrib += calculateLightContrib(light, worldPos.xyz, normal.xyz);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);

    // var tile : vec3<u32> = getTile(in.fragPos);
    // return vec4<f32>(in.fragPos.xyz/ 1000.0, 1.0);
    // return vec4<f32>(colorSet[tile.z % 9u], 1.0);
}