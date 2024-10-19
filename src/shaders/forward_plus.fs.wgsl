// // TODO-2: implement the Forward+ fragment shader

// // See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

// // ------------------------------------
// // Shading process:
// // ------------------------------------
// // Determine which cluster contains the current fragment.
// // Retrieve the number of lights that affect the current fragment from the cluster’s data.
// // Initialize a variable to accumulate the total light contribution for the fragment.
// // For each light in the cluster:
// //     Access the light's properties using its index.
// //     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
// //     Add the calculated contribution to the total light accumulation.
// // Multiply the fragment’s diffuse color by the accumulated light contribution.
// // Return the final color, ensuring that the alpha component is set appropriately (typically to 1).
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
    // Prefetch
    let epsilon = 1e-5;
    let viewPos = cameraUniforms.viewMat * vec4(in.pos, 1.0);
    let zView = viewPos.z; 
    let zNear = cameraUniforms.nearClip;
    let zFar = cameraUniforms.farClip;
    let nz = f32(clusterSet.nz);

    let clipPos = cameraUniforms.viewProjMat * vec4(in.pos, 1.0);
    let ndc = clipPos.xyz / clipPos.w;
    let ndcX = clamp(ndc.x * 0.5 + 0.5, 0.0, 1.0 - epsilon);
    let ndcY = clamp(ndc.y * 0.5 + 0.5, 0.0, 1.0 - epsilon);
    let clusterX = u32(floor(ndcX * f32(clusterSet.nx)));
    let clusterY = u32(floor(ndcY * f32(clusterSet.ny)));

    let zView_ = clamp(-zView, zNear, zFar); 
    let logFarNearRatio = log(zFar / zNear);
    let logViewNearRatio = log(zView_ / zNear);
    var clusterZ = u32(floor(nz * logViewNearRatio / logFarNearRatio));
    clusterZ = clamp(clusterZ, 0u, clusterSet.nz - 1u);

    let Idx = clusterX + clusterY * clusterSet.nx + clusterZ * clusterSet.nx * clusterSet.ny;
    let cluster = clusterSet.clusters[Idx];

    var totalLightContrib = vec3f(0.0, 0.0, 0.0);
    for (var k = 0u; k < cluster.numLights; k++) {
        let lightIndex = cluster.lightIndices[k];
        let light = lightSet.lights[lightIndex];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1.0);
}