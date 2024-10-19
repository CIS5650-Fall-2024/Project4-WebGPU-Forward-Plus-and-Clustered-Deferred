// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_deferred}) @binding(0) var gBufferPosition: texture_2d<f32>;
@group(${bindGroup_deferred}) @binding(1) var gBufferAlbedo: texture_2d<f32>;
@group(${bindGroup_deferred}) @binding(2) var gBufferNormal: texture_2d<f32>;

@fragment
fn main(@builtin(position) coord : vec4f) -> @location(0) vec4f
{
    let worldpos = textureLoad(
        gBufferPosition,
        vec2i(floor(coord.xy)),
        0
    ).xyz;

    let albedo = textureLoad(
        gBufferAlbedo,
        vec2i(floor(coord.xy)),
        0
    ).xyz;

    let normal = textureLoad(
        gBufferNormal,
        vec2i(floor(coord.xy)),
        0
    ).xyz;

    // Determine which cluster contains the current fragment
    let posNDCSpace = applyTransform(vec4f(worldpos, 1.0), cameraUniforms.viewproj);
    let clusterIndexX = u32((posNDCSpace.x + 1.0) * 0.5 * f32(${numClusterX}));
    let clusterIndexY = u32((posNDCSpace.y + 1.0) * 0.5 * f32(${numClusterY}));
    
    let posViewSpace = cameraUniforms.view * vec4f(worldpos, 1.0);
    let viewZ = clamp(-posViewSpace.z, cameraUniforms.nearFar[0], cameraUniforms.nearFar[1]);
    let clusterIndexZ = u32(log(viewZ / cameraUniforms.nearFar[0]) / log(cameraUniforms.nearFar[1] / cameraUniforms.nearFar[0]) * f32(${numClusterZ}));

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
        totalLightContrib += calculateLightContrib(light, worldpos, normal);
    }

    // Multiply the fragment’s diffuse color by the accumulated light contribution.
    var finalColor = albedo.rgb * totalLightContrib;
    
    return vec4(finalColor, 1);
}
