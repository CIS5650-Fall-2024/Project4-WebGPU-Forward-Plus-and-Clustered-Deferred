// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUnif: CameraUniforms;
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

// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // ------------------------------------
    // Shading process:
    // ------------------------------------
    // Determine which cluster contains the current fragment.
    let clusterDim: vec3<u32> = vec3<u32>(${clusterDim[0]}, ${clusterDim[1]}, ${clusterDim[2]});
    let VSPos : vec4<f32> = cameraUnif.viewMat * vec4<f32>(in.pos, 1.0);
    let clusterZ : u32 = u32((log(abs(VSPos.z) / zNear) * f32(clusterDim.z)) / log(zFar / zNear));
    let CSPos : vec4<f32> = cameraUnif.viewProjMat * vec4<f32>(in.pos, 1.0);
    let NDCPos : vec3<f32> = (CSPos.xyz / CSPos.w) * 0.5 + 0.5;
    let clusterX : u32 = u32(NDCPos.x * f32(clusterDim.x));
    let clusterY : u32 = u32(NDCPos.y * f32(clusterDim.y));
    let clusterIdx : u32 = clusterX + clusterY * clusterDim.x + clusterZ * clusterDim.x * clusterDim.y;
    let cluster = &(clusterSet.clusters[clusterIdx]);
    
    // Retrieve the number of lights that affect the current fragment from the cluster’s data.
    let numLights : u32 = cluster.numLights;

    // Initialize a variable to accumulate the total light contribution for the fragment.
    var totalLightContrib = vec3f(0, 0, 0);

    // For each light in the cluster:
    for (var idx = 0u; idx < numLights; idx++) {
        let lightIdx = cluster.indices[idx];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}