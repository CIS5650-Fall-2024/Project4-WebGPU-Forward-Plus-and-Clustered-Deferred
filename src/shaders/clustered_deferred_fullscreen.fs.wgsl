// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraData: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var gbufferAlbedoTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(2) var gbufferNormalTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(3) var gbufferPositionTex: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(4) var gbufferAlbedoSampler: sampler;
@group(${bindGroup_scene}) @binding(5) var gbufferNormalSampler: sampler;
@group(${bindGroup_scene}) @binding(6) var gbufferPositionSampler: sampler;
@group(${bindGroup_scene}) @binding(7) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(8) var<storage, read> clusters: array<Cluster>;
@group(${bindGroup_scene}) @binding(9) var<uniform> clusterGrid: ClusterGridMetadata; 

struct FragmentInput {
    @location(0) uv: vec2<f32>,
    @builtin(position) fragCoord: vec4<f32>
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let flippedUV = vec2<f32>(in.uv.x, 1.0 - in.uv.y);
    let albedo = textureSample(gbufferAlbedoTex, gbufferAlbedoSampler, flippedUV);
    let normal = textureSample(gbufferNormalTex, gbufferNormalSampler, flippedUV);
    let position = textureSample(gbufferPositionTex, gbufferPositionSampler, flippedUV);

    let clusterIndex = calculateClusterIndex(in.fragCoord, position.xyz);
    let currentCluster = clusters[clusterIndex];

    var totalLightContrib = vec3f(0, 0, 0);

    for (var i = 0u; i < currentCluster.numLights; i++) {
        let lightIdx = currentCluster.lightIndices[i];

        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, position.xyz, normal.xyz);
    }

    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}

fn calculateZIndexFromDepth(depth: f32) -> u32 {
    let logZRatio = log2(cameraData.zFar / cameraData.zNear);
    let clusterDepthSize = logZRatio / f32(clusterGrid.clusterGridSizeZ);
    return u32(log2(depth / cameraData.zNear) / clusterDepthSize);
}

fn calculateClusterIndex(fragPixelPos: vec4f, fragPosWorld: vec3f) -> u32 {
    let clusterX = u32(fragPixelPos.x / f32(clusterGrid.canvasWidth) * f32(clusterGrid.clusterGridSizeX));
    let clusterY = u32(fragPixelPos.y / f32(clusterGrid.canvasHeight) * f32(clusterGrid.clusterGridSizeY));

    let fragPosView: vec4f = cameraData.viewMat * vec4(fragPosWorld, 1);
    let clusterZ = calculateZIndexFromDepth(abs(fragPosView.z));

    return clusterX + clusterY * clusterGrid.clusterGridSizeX + clusterZ * clusterGrid.clusterGridSizeX * clusterGrid.clusterGridSizeY;
}
