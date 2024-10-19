// Fragment shader to perform lighting calculations using G-buffer and clustered lights


// Bindings
@group(0) @binding(0) var gBufferPositionTex: texture_2d<f32>;
@group(0) @binding(1) var gBufferNormalTex: texture_2d<f32>;
@group(0) @binding(2) var gBufferAlbedoTex: texture_2d<f32>;
@group(0) @binding(3) var gBufferSampler: sampler;

@group(1) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(1) @binding(1) var<storage, read> lightSet: LightSet;
@group(1) @binding(2) var<storage, read> clusterSet: ClusterSet;

// Include necessary structs and functions


struct FragmentInput {
    @location(0) uv: vec2f
}

fn applyTransformT(pos: vec4<f32>, mat: mat4x4<f32>) -> vec4<f32> {
    return mat * pos;
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    // Sample G-buffer data
    let pos = textureSample(gBufferPositionTex, gBufferSampler, in.uv).xyz;
    let normal = normalize(textureSample(gBufferNormalTex, gBufferSampler, in.uv).xyz);
    let albedo = textureSample(gBufferAlbedoTex, gBufferSampler, in.uv).xyz;

    // Transform the fragment's position to Normalized Device Coordinates (NDC).
    // Transform the fragment's position to Clip Space
    let posClipSpace = applyTransformT(vec4f(pos, 1.0), cameraUniforms.viewproj);

    // Convert Clip Space to NDC by dividing by w
    let ndcPos = posClipSpace.xyz / posClipSpace.w;
    // Compute cluster indices based on NDC.
    let clusterIndexX = u32((ndcPos.x + 1.0) * 0.5 * f32(${numClusterX}));
    let clusterIndexY = u32((ndcPos.y + 1.0) * 0.5 * f32(${numClusterY}));

    // Compute the view-space Z coordinate and determine the Z cluster index.
    let posViewSpace = applyTransformT(vec4f(pos, 1.0), cameraUniforms.view);
    let viewZ = clamp(-posViewSpace.z, cameraUniforms.clipPlanes[0], cameraUniforms.clipPlanes[1]);
    let clusterIndexZ = u32(log(viewZ / cameraUniforms.clipPlanes[0]) / 
                            log(cameraUniforms.clipPlanes[1] / cameraUniforms.clipPlanes[0]) * 
                            f32(${numClusterZ}));

    // Clamp cluster indices to valid ranges
    let clusterIndexXClamped = clamp(clusterIndexX, 0u, ${numClusterX} - 1u);
    let clusterIndexYClamped = clamp(clusterIndexY, 0u, ${numClusterY} - 1u);
    let clusterIndexZClamped = clamp(clusterIndexZ, 0u, ${numClusterZ} - 1u);

    // Calculate the final cluster index in the 3D grid.
    let clusterIndex = clusterIndexXClamped + 
                       clusterIndexYClamped * ${numClusterX} + 
                       clusterIndexZClamped * ${numClusterY} * ${numClusterX};

    // Retrieve the number of lights affecting the current fragment.
    let numLights = clusterSet.clusters[clusterIndex].numLights;

    // Accumulate the total light contribution for the fragment.
    var totalLightContrib = vec3f(0.0, 0.0, 0.0);
    for (var i = 0u; i < numLights; i++) {
        // Access the light's properties using its index from the cluster data.
        let lightIndex = clusterSet.clusters[clusterIndex].lights[i];
        let light = lightSet.lights[lightIndex];
        
        // Calculate and accumulate the light's contribution to the fragment.
        totalLightContrib += calculateLightContrib(light, pos, normal);
    }

    // Combine the albedo color with the accumulated light contribution.
    var finalColor = albedo * totalLightContrib;
    
    // Return the final color, setting the alpha to 1.
    return vec4(finalColor, 1.0);
}