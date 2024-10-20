// DONE-2: implement the Forward+ fragment shader

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
    let clip_pos = cameraUniforms.viewProjMat * vec4f(in.pos, 1.0);
    let ndc_pos = clip_pos.xy / clip_pos.w;  // Using only x and y
    let ndc_pos_0_1 = clamp((ndc_pos * 0.5) + 0.5, vec2f(0.0), vec2f(1.0));
    let clusterIdx_x = u32(ndc_pos_0_1.x * f32(clusterSet.clusterCountX));
    let clusterIdx_y = u32(ndc_pos_0_1.y * f32(clusterSet.clusterCountY));

    let view_pos = cameraUniforms.viewMat * vec4f(in.pos, 1.0);
    let view_depth_step = pow(cameraUniforms.farPlane / cameraUniforms.nearPlane, 1.0 / f32(clusterSet.clusterCountZ));
    let clusterIdx_z = u32(log(view_pos.z / cameraUniforms.nearPlane) / log(view_depth_step));

    let clusterIdx = clamp(clusterIdx_x + (clusterIdx_y * clusterSet.clusterCountX) + (clusterIdx_z * clusterSet.clusterCountX * clusterSet.clusterCountY), 0, clusterSet.clusterCount - 1);

    // Retrieve the number of lights that affect the current fragment from the cluster’s data
    let cluster = clusterSet.clusters[clusterIdx];
    let lightCount = cluster.lightCount;

    // Initialize a variable to accumulate the total light contribution for the fragment
    var totalLightContribution = vec3f(0, 0, 0);

    // For each light in the cluster
    for (var i = 0u; i < lightCount; i++)
    {
        // Access the light's properties using its index
        let light = lightSet.lights[cluster.lightIndices[i]];
        // Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal
        // Add the calculated contribution to the total light accumulation
        totalLightContribution += calculateLightContrib(light, in.pos, in.nor);
    }

    // Multiply the fragment’s diffuse color by the accumulated light contribution
    let finalColor = diffuseColor.rgb * totalLightContribution;
    // Return the final color, ensuring that the alpha component is set appropriately (typically to 1)
    return vec4f(finalColor, 1.0);
}