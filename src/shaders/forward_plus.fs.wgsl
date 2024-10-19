// TODO-2: implement the Forward+ fragment shader
// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

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
struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
    @location(3) pos_view: vec3f
}

@fragment
fn main(in: FragmentInput, @builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4f {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    var totalLightContrib = vec3f(0, 0, 0);

    var screenUV = vec2f(fragCoord.xy) / vec2f(cameraUniforms.screenSize.xy);
    screenUV.y = 1.0 - screenUV.y;
    let i = u32(floor(screenUV.x * f32(CLUSTER_DIMENSIONS.x)));
    let j = u32(floor(screenUV.y * f32(CLUSTER_DIMENSIONS.y)));
    let n = cameraUniforms.nearAndFar.x;
    let f = cameraUniforms.nearAndFar.y;
    let viewZ = clamp(-in.pos_view.z, n, f);
    let logDepthRatio = log(f / n);
    let clusterZf = (log(viewZ / n) / logDepthRatio) * f32(CLUSTER_DIMENSIONS.z);
    let k = clamp(u32(floor(clusterZf)), 0u, CLUSTER_DIMENSIONS.z - 1u);

    // Convert 3D indices (i, j, k) to 1D cluster index
    let clusterIdx = clamp(i * CLUSTER_DIMENSIONS.y * CLUSTER_DIMENSIONS.z + j * CLUSTER_DIMENSIONS.z + k, 0u, ${numOfClusters}u);
    let cluster = clusterSet.clusters[clusterIdx];

    let numLightsInCluster = cluster.numLights;
    for (var lightIdx = 0u; lightIdx < numLightsInCluster; lightIdx++) {
        let light = lightSet.lights[cluster.lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib.rgb;
    return vec4(finalColor, 1.0);
}