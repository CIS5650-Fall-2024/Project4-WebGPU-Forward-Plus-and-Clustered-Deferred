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

@group(${bindGroup_scene}) @binding(0) var<uniform> camera_uniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

@group(${bindGroup_cluster}) @binding(0) var<uniform> cluster_grid_dimensions: vec4u;
@group(${bindGroup_cluster}) @binding(3) var<storage, read_write> cluster_indices: ClusterSet;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
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
    let cluster_index = compute_cluster_index(in.pos, camera_uniforms, cluster_grid_dimensions.xyz);
    let cluster_index_flat = flatten_index(cluster_index, cluster_grid_dimensions.xyz);

    let cluster_start = cluster_index_flat * cluster_grid_dimensions.w;

    var totalLightContrib = vec3f(0, 0, 0);

    for (var cluster_cursor = cluster_start; cluster_cursor < cluster_start + cluster_grid_dimensions.w; cluster_cursor += 1) {
        let l = cluster_indices.light_indices[cluster_cursor];
        if (l == (1 << 32) - 1) {
            break;
        }

        let light = lightSet.lights[l];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
