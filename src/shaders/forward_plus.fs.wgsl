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
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: array<u32>;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
};

const NUM_CLUSTERS_X: u32 = ${numClustersX};
const NUM_CLUSTERS_Y: u32 = ${numClustersY};
const NUM_CLUSTERS_Z: u32 = ${numClustersZ};
const MAX_LIGHTS_PER_CLUSTER: u32 = ${maxLightsPerCluster};

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // Determine the cluster ID
    let clusterID = getClusterID(in);
    let cluster = clusterID * (1u + MAX_LIGHTS_PER_CLUSTER);

    // Retrieve the number of lights affecting this fragment
    let numLights = clusterSet[cluster];

    // Initialize the total light contribution
    var totalLightContrib = vec3f(0.0, 0.0, 0.0);

    // Loop over the lights in the cluster
    for (var i: u32 = 0u; i < numLights; i = i + 1u) {
        // Get the light index from the cluster's light list
        let lightIndex = clusterSet[cluster + 1u + i];
        let light = lightSet.lights[lightIndex];

        // Calculate the light contribution
        totalLightContrib += calculateLightContrib(light, in.pos, normalize(in.nor));
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1.0);
}

fn getClusterID(in: FragmentInput) -> u32 {
    // Transform fragment position to view space
    let viewPos = cameraUniforms.viewMat * vec4<f32>(in.pos, 1.0);

    // Transform fragment position to clip space using view-projection matrix
    var clipPos = cameraUniforms.viewProjMat * vec4<f32>(in.pos, 1.0);
    let ndcPos = clipPos.xyz / clipPos.w;

    // Compute cluster indices for x and y based on NDC
    let xCluster = u32(clamp(floor((ndcPos.x + 1.0) / 2.0 * f32(NUM_CLUSTERS_X)), 0.0, f32(NUM_CLUSTERS_X - 1u)));
    let yCluster = u32(clamp(floor((ndcPos.y + 1.0) / 2.0 * f32(NUM_CLUSTERS_Y)), 0.0, f32(NUM_CLUSTERS_Y - 1u)));

    // Compute depth slice index using logarithmic depth slicing
    let depth = -viewPos.z;
    let nearPlane = cameraUniforms.params.x;
    let farPlane = cameraUniforms.params.y;
    let logDepth = log(depth / nearPlane) / log(farPlane / nearPlane);
    let zCluster = u32(clamp(floor(logDepth * f32(NUM_CLUSTERS_Z)), 0.0, f32(NUM_CLUSTERS_Z - 1u)));

    // Calculate the final cluster ID
    let clusterID = xCluster + yCluster * NUM_CLUSTERS_X + zCluster * NUM_CLUSTERS_X * NUM_CLUSTERS_Y;
    return clusterID;
}