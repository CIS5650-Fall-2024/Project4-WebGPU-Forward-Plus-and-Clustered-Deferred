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

@group(${bindGroup_scene}) @binding(0) var<uniform> viewProjMat: mat4x4f;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

const clusterPerDim = 16u;

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // find the pixel space index
    let clipSpacePos = viewProjMat * vec4f(in.pos, 1.0f);
    let ndcSpacePos = clipSpacePos.xyz / clipSpacePos.w;
    let depth = ndcSpacePos.z;
    let x = ndcSpacePos.x * 0.5f + 0.5f;
    let y = 0.5 - ndcSpacePos.y * 0.5f;

    // find the cluster index
    var x_idx = u32(x * f32(clusterPerDim));
    var y_idx = u32(y * f32(clusterPerDim));
    var z_idx = u32(depth * f32(clusterPerDim));
    // return vec4f(f32(x_idx) / f32(clusterPerDim), f32(y_idx) / f32(clusterPerDim), f32(z_idx) / f32(clusterPerDim), 1.0f);

    let clusterIdx = x_idx + y_idx * clusterPerDim + z_idx * clusterPerDim * clusterPerDim;
    let clusterLightCount = clusterSet.clusters[clusterIdx].numLights;

    var totalLightContrib = vec3f(0, 0, 0);
    // for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
    //     let light = lightSet.lights[lightIdx];
    //     totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    // }
    var has_light = false;
    for (var lightIdx = 0u; lightIdx < clusterLightCount; lightIdx++) {
        let light = lightSet.lights[clusterSet.clusters[clusterIdx].lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
        has_light = true;
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    // if (!has_light) {
    //     finalColor = vec3f(1, 0, 0);
    // }else{
    //     finalColor = diffuseColor.rgb * totalLightContrib;
    // }
    return vec4(finalColor, 1);
}

