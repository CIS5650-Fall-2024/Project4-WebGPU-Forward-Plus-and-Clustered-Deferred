// TODO-2: implement the Forward+ fragment shader
// See naive.fs.wgsl for basic fragment shader setup; this shader uses light clusters instead of looping over all lights

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: array<ClusterSet>;

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
    
    let clipPos = cameraUniforms.viewProj * vec4f(in.pos, 1f);

    let xIdx = floor(((clipPos.x / clipPos.w) + 1.0) / 2.0 * ${clusterSize});
    let yIdx = floor(((clipPos.y / clipPos.w) + 1.0) / 2.0 * ${clusterSize});

    let viewPos = cameraUniforms.view * vec4(in.pos, 1f);
    let logDepth = log(cameraUniforms.far / cameraUniforms.near);
    let zIdx = floor(log(-viewPos.z / cameraUniforms.near) / logDepth * ${clusterSize});

    // ------------------------------------
    // Shading process:
    // ------------------------------------

    // Determine which cluster contains the current fragment.
    let clusterIdx = u32(xIdx) + u32(yIdx) * ${clusterSize} + u32(zIdx) * ${clusterSize} * ${clusterSize};    

    // Retrieve the number of lights that affect the current fragment from the cluster’s data.
    let clusterLights = clusterSet[clusterIdx].numLights;

    // Initialize a variable to accumulate the total light contribution for the fragment.
    var totalLightContrib = vec3f(0, 0, 0);

    // For each light in the cluster:
    for (var l = 0u; l < clusterLights; l++) {
        
        // Access the light's properties using its index.
        let light = lightSet.lights[clusterSet[clusterIdx].lights[l]];

        // Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
        let lightContrib = calculateLightContrib(light, in.pos, in.nor);

        // Add the calculated contribution to the total light accumulation.
        totalLightContrib += lightContrib;
    }

    // Multiply the fragment’s diffuse color by the accumulated light contribution.
    var finalColor = diffuseColor.rgb * totalLightContrib;

    // // Return the final color, ensuring that the alpha component is set appropriately (typically to 1).
    return vec4f(finalColor, 1);
}