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
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // Determine which cluster contains the current fragment
    let posNDCSpace = applyTransform(vec4f(in.pos.x ,in.pos.y, in.pos.z, 1.0), cameraUniforms.viewproj);
    let clusterIndexX = u32((posNDCSpace.x + 1.0) * 0.5 * f32(${numClusterX}));
    let clusterIndexY = u32((posNDCSpace.y + 1.0) * 0.5 * f32(${numClusterY}));
    let clusterIndexZ = u32(posNDCSpace.z * f32(${numClusterZ}));
    // let posNDCSpace = applyTransform(vec4f(in.pos.x ,in.pos.y, in.pos.z, 1.0), cameraUniforms.viewproj);
    // let clusterIndexX = u32(posNDCSpace.x * 2.0 / f32(${numClusterX}) - 1.0);
    // let clusterIndexY = u32(posNDCSpace.y * 2.0 / f32(${numClusterY}) - 1.0);
    // let clusterIndexZ = u32(posNDCSpace.z / f32(${numClusterZ}));

    let clusterIndex = clusterIndexX + 
                    clusterIndexY * ${numClusterX} + 
                    clusterIndexZ * ${numClusterY} * ${numClusterX};

    // Retrieve the number of lights that affect the current fragment from the cluster’s data.
    let numLights = clusterSet.clusters[clusterIndex].numLights;

    // Initialize a variable to accumulate the total light contribution for the fragment.
    var totalLightContrib = vec3f(0, 0, 0);
    // For each light in the cluster:
    for (var lightIdx = 0u; lightIdx < numLights; lightIdx++) {
        // Access the light's properties using its index.
        let light = lightSet.lights[clusterSet.clusters[clusterIndex].lights[lightIdx]];
        // Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
        // Add the calculated contribution to the total light accumulation.
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    // Multiply the fragment’s diffuse color by the accumulated light contribution.
    var finalColor = diffuseColor.rgb * totalLightContrib;
    // Return the final color, ensuring that the alpha component is set appropriately (typically to 1).
    // return vec4(f32(clusterIndexZ) / f32(${numClusterZ}), 0, 0, 1);
    // return vec4(f32(clusterIndexX) / f32(${numClusterX}), f32(clusterIndexY) / f32(${numClusterY}), f32(clusterIndexZ) / f32(${numClusterZ}), 1);
    // return vec4(0.0, 0.0, posNDCSpace.z, 1.0);
    //return vec4(totalLightContrib, 1);
    return vec4(f32(numLights) ,0,0, 1);
}
