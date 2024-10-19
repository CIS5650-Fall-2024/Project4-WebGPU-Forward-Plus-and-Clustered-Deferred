// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var albedoTex: texture_2d<f32>;
@group(0) @binding(3) var normalTex: texture_2d<f32>;
@group(0) @binding(4) var positionTex: texture_2d<f32>;
@group(0) @binding(5) var textureSampler: sampler;

@group(1) @binding(0) var<uniform> res: Resolution;
@group(1) @binding(1) var<uniform> tileInfo: TileInfo;
@group(1) @binding(2) var<storage> tilesLightIdxBuffer: array<u32>;
@group(1) @binding(3) var<storage> tilesLightGridBuffer: array<u32>;

@fragment
fn main(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4f
{
    var UV = vec2<f32>(fragCoord.x / f32(res.width), fragCoord.y / f32(res.height));
    var worldPos = textureSample(positionTex, textureSampler, UV).xyz;
    var viewPos = (cameraUniforms.view * vec4<f32>(worldPos, 1.0)).xyz;

    var depth = (-viewPos.z - cameraUniforms.near) / (cameraUniforms.far - cameraUniforms.near);
    // exponential depth
    depth = cameraUniforms.near * pow(cameraUniforms.far / cameraUniforms.near, depth);

    var tileXidx = u32(floor(UV.x * f32(tileInfo.numTilesX)));
    var tileYidx = u32(floor(UV.y * f32(tileInfo.numTilesY)));
    var tileZidx = u32(floor(depth * f32(tileInfo.numTilesZ)));
    var clusterIdx = tileZidx * tileInfo.numTilesX * tileInfo.numTilesY + tileYidx * tileInfo.numTilesX + tileXidx;

    // fetch G-buffer data
    var albedo = textureSample(albedoTex, textureSampler, UV);
    var normal = textureSample(normalTex, textureSampler, UV);

    var totalLightContrib = vec3<f32>(0.0, 0.0, 0.0);
    var startLightIdx = clusterIdx * u32(${maxLightsPerTile});
    var lightCount = tilesLightGridBuffer[clusterIdx];
    for (var i = 0u; i < lightCount; i = i + 1u) {
        var lightIdx = tilesLightIdxBuffer[startLightIdx + i];
        var light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, worldPos, normal.xyz);
    }

    // return vec4(worldPos, 1.0);
    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1.0);
}
