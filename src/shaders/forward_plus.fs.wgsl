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

struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let clusterIndices = getClusterIndex(cameraUniforms, in.pos);
    let clusterX = clusterIndices.x;
    let clusterY = clusterIndices.y;
    let clusterZ = clusterIndices.z;

    let clusterIndex = clusterX + clusterY * numClustersX + clusterZ * numClustersX * numClustersY;
    let cluster = clusterSet.clusters[clusterIndex];

    var totalLight: vec3f = vec3f(0.f);
    for (var i = 0u; i < cluster.lightCount; i += 1) {
        let lightIndex = cluster.lightIndices[i];
        let light = lightSet.lights[lightIndex];
        totalLight += calculateLightContrib(light, in.pos, in.nor);
    }

    return vec4f(diffuseColor.rgb * totalLight, 1.f);
}
