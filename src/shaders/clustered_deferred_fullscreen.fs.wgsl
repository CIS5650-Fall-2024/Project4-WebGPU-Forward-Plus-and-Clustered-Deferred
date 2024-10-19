// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_gBuffer}) @binding(0) var posTex: texture_2d<f32>;
@group(${bindGroup_gBuffer}) @binding(1) var norTex: texture_2d<f32>;
@group(${bindGroup_gBuffer}) @binding(2) var albedoTex: texture_2d<f32>;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let pixelPos: vec2<u32> = vec2<u32>(in.fragPos.xy);
    let nor = textureLoad(norTex, pixelPos, 0);
    let diffuseColor = textureLoad(albedoTex, pixelPos, 0);
    let pos = textureLoad(posTex, pixelPos, 0);
    let pos_view = cameraUniforms.view * vec4<f32>(pos.xyz, 1.0);
    var pos_ndc = cameraUniforms.viewProj * vec4<f32>(pos.xyz, 1.0);
    pos_ndc = pos_ndc / pos_ndc.w;

    let scaledPos_ndc = pos_ndc * 0.5 + 0.5;
    let i = u32(floor(scaledPos_ndc.x * f32(CLUSTER_DIMENSIONS.x)));
    let j = u32(floor(scaledPos_ndc.y * f32(CLUSTER_DIMENSIONS.y)));
    let n = cameraUniforms.nearAndFar.x;
    let f = cameraUniforms.nearAndFar.y;
    let viewZ = clamp(-pos_view.z, n, f);
    let logDepthRatio = log(f / n);
    let clusterZf = (log(viewZ / n) / logDepthRatio) * f32(CLUSTER_DIMENSIONS.z);
    let k = clamp(u32(floor(clusterZf)), 0u, CLUSTER_DIMENSIONS.z - 1u);

    // Convert 3D indices (i, j, k) to 1D cluster index
    let clusterIdx = clamp(i * CLUSTER_DIMENSIONS.y * CLUSTER_DIMENSIONS.z + j * CLUSTER_DIMENSIONS.z + k, 0u, ${numOfClusters}u);
    let cluster = clusterSet.clusters[clusterIdx];

    var totalLightContrib = vec3f(0, 0, 0);
    let numLightsInCluster = cluster.numLights;
    for (var lightIdx = 0u; lightIdx < numLightsInCluster; lightIdx++) {
        let light = lightSet.lights[cluster.lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, pos.xyz, nor.xyz);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib.rgb;
    return vec4(finalColor, 1.0);
}