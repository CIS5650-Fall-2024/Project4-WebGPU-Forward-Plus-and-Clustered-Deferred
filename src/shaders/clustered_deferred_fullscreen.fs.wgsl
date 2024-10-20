// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var<uniform> screenDim: vec2f;

// Read from the G-buffer instead of the material
@group(1) @binding(0) var albedoTex: texture_2d<f32>;
@group(1) @binding(1) var normalTex: texture_2d<f32>;
@group(1) @binding(2) var positionTex: texture_2d<f32>;
@group(1) @binding(3) var bufferSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2<f32>,
};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let normal = textureSample(normalTex, bufferSampler, in.uv); // texture, sampler, uvcoord
    let albedo = textureSample(albedoTex, bufferSampler, in.uv);
    let position = textureSample(positionTex, bufferSampler, in.uv);

    var screenSpace: vec4f = cameraUniforms.viewProj * vec4(position.xyz, 1.0);
    screenSpace = screenSpace / screenSpace.w * 0.5 + 0.5;

    var clusterNumZ: f32 = f32(${clusterNumZ});
    var clusterNumXY: vec2f = vec2f(f32(${clusterNumX}), f32(${clusterNumY}));
    var zNear: f32 = f32(${zNear});
    var zFar: f32 = f32(${zFar});

    var camSpace: vec4f = cameraUniforms.viewMat * vec4(position.xyz, 1.0);
    var zTile: u32 = u32(clusterNumZ * log(abs(camSpace.z) / zNear) / log(zFar / zNear));
    var xyTileSize: vec2f = 1.0 / clusterNumXY;
    var xyTile: vec2u = vec2u(screenSpace.xy / xyTileSize);
    var tileIndex: u32 = xyTile.x + (xyTile.y * ${clusterNumX}) + (zTile * ${clusterNumX} * ${clusterNumY});

    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < clusterSet.clusters[tileIndex].count; lightIdx++) {
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, position.xyz, normal.xyz);
    }

    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1.0);
}