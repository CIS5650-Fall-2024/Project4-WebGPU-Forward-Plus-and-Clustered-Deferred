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
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

@group(${bindGroup_lightcull}) @binding(0) var<uniform> res: Resolution;
@group(${bindGroup_lightcull}) @binding(1) var<uniform> tileInfo: TileInfo;
@group(${bindGroup_lightcull}) @binding(2) var<storage> tilesLightIdxBuffer: array<u32>;
@group(${bindGroup_lightcull}) @binding(3) var<storage> tilesLightGridBuffer: array<u32>;
@group(${bindGroup_lightcull}) @binding(4) var depthTex:  texture_depth_2d;
@group(${bindGroup_lightcull}) @binding(5) var depthTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}


@fragment
fn main(in: FragmentInput, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }
    var UV = vec2<f32>(fragCoord.x / f32(res.width), fragCoord.y / f32(res.height));
    var rawDepth = textureSample(depthTex, depthTexSampler, UV);
    if (fragCoord.z > rawDepth) {
        discard;
    }

    var totalLightContrib = vec3f(0, 0, 0);

    let tileXmin_screen = fragCoord.x - fragCoord.x % ${tileSize};
    let tileYmin_screen = fragCoord.y - fragCoord.y % ${tileSize};
    let tileXmax_screen = min(tileXmin_screen + ${tileSize}, f32(res.width));
    let tileYmax_screen = min(tileYmin_screen + ${tileSize}, f32(res.height));

    var viewPos = (cameraUniforms.view * vec4(in.pos, 1.0)).xyz;
    var depth = (-viewPos.z - cameraUniforms.near) / (cameraUniforms.far - cameraUniforms.near);
    // exponential depth
    depth = cameraUniforms.near * pow(cameraUniforms.far / cameraUniforms.near, depth);


    let tileXidx = u32(floor(fragCoord.x / ${tileSize}));
    let tileYidx = u32(floor(fragCoord.y / ${tileSize}));
    let tileZidx = u32(floor(depth * ${tileSizeZ}));
    let clusterIdx = tileZidx * tileInfo.numTilesX * tileInfo.numTilesY + tileYidx * tileInfo.numTilesX + tileXidx;

    let startLightIdx = clusterIdx * ${maxLightsPerTile};
    let lightCount = tilesLightGridBuffer[clusterIdx];
    for (var i = 0u; i < lightCount; i = i + 1u) {
        let lightIdx = tilesLightIdxBuffer[startLightIdx + i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    // return vec4(vec3(f32(tileZidx) / ${tileSizeZ}), 1.0);
    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
