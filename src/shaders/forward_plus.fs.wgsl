// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).

// linear <-> sRGB conversions
fn linearTosRGB(linear : vec3<f32>) -> vec3<f32> {
  if (all(linear <= vec3<f32>(0.0031308, 0.0031308, 0.0031308))) {
    return linear * 12.92;
  }
  return (pow(abs(linear), vec3<f32>(1.0/2.4, 1.0/2.4, 1.0/2.4)) * 1.055) - vec3<f32>(0.055, 0.055, 0.055);
}

fn sRGBToLinear(srgb : vec3<f32>) -> vec3<f32> {
  if (all(srgb <= vec3<f32>(0.04045, 0.04045, 0.04045))) {
    return srgb / vec3<f32>(12.92, 12.92, 12.92);
  }
  return pow((srgb + vec3<f32>(0.055, 0.055, 0.055)) / vec3<f32>(1.055, 1.055, 1.055), vec3<f32>(2.4, 2.4, 2.4));
}

@group(0) @binding(0) var<uniform> cameraUniforms : CameraUniforms;
@group(0) @binding(1) var<uniform> view : ViewUniforms;
@group(0) @binding(2) var<storage, read> lightSet: LightSet;
@group(0) @binding(3) var<storage, read_write> clusters : Clusters;
@group(0) @binding(4) var<storage, read_write> clusterLights : ClusterLightGroup;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

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
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
}

// Debug
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
    // return in.fragPos / 100.0;
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // let nor = in.nor * 0.5 + 0.5;
    // return vec4f(nor, 1.0);

    var totalLightContrib = vec3f(0, 0, 0);
    let clusterIndex = getClusterIndex(in.fragPos);
    let lightOffset  = clusterLights.lights[clusterIndex].offset;
    let lightCount   = clusterLights.lights[clusterIndex].count;

    //return vec4<f32>(vec3<f32>(f32(lightCount))/10.0, 1.0);

    for (var lightIndex = 0u; lightIndex < lightCount; lightIndex = lightIndex + 1u) {
        let i = clusterLights.indices[lightOffset + lightIndex];
        let light = lightSet.lights[i];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }


    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);

    // var tile : vec3<u32> = getTile(in.fragPos);
    // return vec4<f32>(in.fragPos.xyz / 1000.0, 1.0);
    // return vec4<f32>(colorSet[tile.z % 9u], 1.0);
}