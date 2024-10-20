// DONE-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0) var gBufferDiffuse: texture_2d<f32>;
@group(1) @binding(1) var gBufferNormal: texture_2d<f32>;
@group(1) @binding(2) var gBufferDepth: texture_depth_2d;

// helpful: https://webgpu.github.io/webgpu-samples/?sample=deferredRendering#fragmentDeferredRendering.wgsl
@fragment
fn main(@builtin(position) coord : vec4f) -> @location(0) vec4f
{
    let depth = textureLoad(gBufferDepth, vec2i(floor(coord.xy)), 0);

    // Discard fragments where depth is greater than or equal to 1.0 (out of bounds)
    if (depth >= 1.0) {
        discard;
    }
    
    let diffuse = textureLoad(gBufferDiffuse, vec2i(floor(coord.xy)), 0).rgb;
    let normal = textureLoad(gBufferNormal, vec2i(floor(coord.xy)), 0).xyz;

    // Determine which cluster contains the current fragment
    let bufferSize = textureDimensions(gBufferDepth);
    let coord_uv = coord.xy / vec2f(bufferSize);
    let clip_pos = vec4(coord_uv.x * 2.0 - 1.0, (1.0 - coord_uv.y) * 2.0 - 1.0, depth, 1.0);
    let ndc_pos = clip_pos.xy / clip_pos.w;  // Using only x and y
    let ndc_pos_0_1 = clamp((ndc_pos * 0.5) + 0.5, vec2f(0.0), vec2f(1.0));
    let clusterIdx_x = u32(ndc_pos_0_1.x * f32(clusterSet.clusterCountX));
    let clusterIdx_y = u32(ndc_pos_0_1.y * f32(clusterSet.clusterCountY));
    
    let world_pos_w = cameraUniforms.invViewProjMat * clip_pos;
    let world_pos = world_pos_w.xyz / world_pos_w.w;
    let view_pos = (cameraUniforms.viewMat * vec4(world_pos, 1.0)).xyz;
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
        totalLightContribution += calculateLightContrib(light, world_pos, normal);
    }

    // Multiply the fragment’s diffuse color by the accumulated light contribution
    let finalColor = diffuse.rgb * totalLightContribution;
    // Return the final color, ensuring that the alpha component is set appropriately (typically to 1)
    return vec4f(finalColor, 1.0);
}