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

    //determine current cluster
    var posNDCSpace = cameraUniforms.viewProjMat * vec4(in.pos, 1.0);
    posNDCSpace /= posNDCSpace.w;
    let clusterX = u32((posNDCSpace.x + 1.0) * 0.5 * f32(${numClustersX}));
    let clusterY = u32((posNDCSpace.y + 1.0) * 0.5 * f32(${numClustersY}));
    let posViewSpace = cameraUniforms.viewProjMat * vec4f(in.pos.x ,in.pos.y, in.pos.z, 1.0);
    let viewZ = clamp(-posViewSpace.z, 0.1, 1000.0);
    let clusterZ = u32(log(viewZ / 0.1) / log(1000.0 / 0.1) * f32(${numClustersZ}));
    let clusterIdx = u32(clusterX + ${numClustersY} * clusterY + ${numClustersY} * ${numClustersZ} * clusterZ);
    let cluster = &clusterSet.clusters[clusterIdx];

    var totalLightContrib = vec3f(0, 0, 0);

    for (var lightIdx = 0u; lightIdx < cluster.numLights; lightIdx++) {
        let light = lightSet.lights[cluster.lights[lightIdx]];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
