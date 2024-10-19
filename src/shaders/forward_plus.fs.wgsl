// TODO: Implement the Forward+ fragment shader using clustered lighting
// Reference: naive.fs.wgsl for basic fragment shader setup. This shader uses light clusters
// to efficiently determine the lights affecting each fragment instead of iterating over all lights.

// ------------------------------------
// Shading Process:
// ------------------------------------
// 1. Determine which cluster contains the current fragment based on its position in normalized device coordinates (NDC).
// 2. Retrieve the number of lights affecting the fragment from the cluster’s data.
// 3. Initialize a variable to accumulate the total light contribution for the fragment.
// 4. For each light in the cluster:
//     a. Access the light's properties using its index.
//     b. Calculate the light's contribution based on its position, the fragment’s position, and the surface normal.
//     c. Add the calculated contribution to the total light accumulation.
// 5. Multiply the fragment’s diffuse color by the accumulated light contribution.
// 6. Return the final color, ensuring that the alpha component is set to 1.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f,  // Fragment position in world space
    @location(1) nor: vec3f,  // Surface normal at the fragment
    @location(2) uv: vec2f    // Texture coordinates
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {

    // Sample the diffuse color from the texture using the fragment's UV coordinates.
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    
    // Discard the fragment if the alpha value is below the threshold.
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // Transform the fragment's position to Normalized Device Coordinates (NDC).
    let posNDCSpace = applyTransform(vec4f(in.pos.x, in.pos.y, in.pos.z, 1.0), cameraUniforms.viewproj);

    // Compute cluster indices based on NDC.
    let clusterIndexX = u32((posNDCSpace.x + 1.0) * 0.5 * f32(${numClusterX}));
    let clusterIndexY = u32((posNDCSpace.y + 1.0) * 0.5 * f32(${numClusterY}));

    // Compute the view-space Z coordinate and determine the Z cluster index.
    let posViewSpace = cameraUniforms.view * vec4f(in.pos.x, in.pos.y, in.pos.z, 1.0);
    let viewZ = clamp(-posViewSpace.z, cameraUniforms.clipPlanes[0], cameraUniforms.clipPlanes[1]);
    let clusterIndexZ = u32(log(viewZ / cameraUniforms.clipPlanes[0]) / 
                            log(cameraUniforms.clipPlanes[1] / cameraUniforms.clipPlanes[0]) * 
                            f32(${numClusterZ}));

    // Calculate the final cluster index in the 3D grid.
    let clusterIndex = clusterIndexX + 
                       clusterIndexY * ${numClusterX} + 
                       clusterIndexZ * ${numClusterY} * ${numClusterX};

    // Retrieve the number of lights affecting the current fragment.
    let numLights = clusterSet.clusters[clusterIndex].numLights;

    // Accumulate the total light contribution for the fragment.
    var totalLightContrib = vec3f(0, 0, 0);
    for (var i = 0u; i < numLights; i++) {
        // Access the light's properties using its index from the cluster data.
        let lightIndex = clusterSet.clusters[clusterIndex].lights[i];
        let light = lightSet.lights[lightIndex];
        
        // Calculate and accumulate the light's contribution to the fragment.
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    // Combine the diffuse color with the accumulated light contribution.
    var finalColor = diffuseColor.rgb * totalLightContrib;
    
    // Return the final color, setting the alpha to 1.
    return vec4(finalColor, 1);
}