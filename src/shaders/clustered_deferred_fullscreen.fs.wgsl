// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterLights: array<u32>;

// Binding indices for G-buffer textures and samplers
@group(1) @binding(0) var positionTexture: texture_2d<f32>;
@group(1) @binding(1) var normalTexture: texture_2d<f32>;
@group(1) @binding(2) var albedoTexture: texture_2d<f32>;
@group(1) @binding(3) var positionSampler: sampler;
@group(1) @binding(4) var normalSampler: sampler;
@group(1) @binding(5) var albedoSampler: sampler;

// Constants
const NUM_CLUSTERS_X: u32 = ${numClustersX};
const NUM_CLUSTERS_Y: u32 = ${numClustersY};
const NUM_CLUSTERS_Z: u32 = ${numClustersZ};
const MAX_LIGHTS_PER_CLUSTER: u32 = ${maxLightsPerCluster};
const LIGHT_RADIUS: f32 = ${lightRadius};

struct FragmentOutput {
    @location(0) color: vec4<f32>,
};

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    // Get the uvs
    let texSize = vec2<f32>(textureDimensions(positionTexture, 0));
    let uv = fragCoord.xy / texSize;

    // Read G-buffer data
    let worldPos = textureSample(positionTexture, positionSampler, uv).xyz;
    let normal = textureSample(normalTexture, normalSampler, uv).xyz;
    let albedo = textureSample(albedoTexture, albedoSampler, uv).rgb;

    // Handle invalid data (optional)
    if (length(normal) == 0.0) {
        discard;
    }

    // Compute view-space position
    let viewPos = (cameraUniforms.viewMat * vec4<f32>(worldPos, 1.0)).xyz;

    // Determine cluster ID
    let clusterID = getClusterID(viewPos);

    // Fetch lights affecting this cluster
    let clusterOffset = clusterID * (1u + MAX_LIGHTS_PER_CLUSTER);
    let numLights = clusterLights[clusterOffset];

    // Initialize the total light contribution
    var totalLightContrib = vec3<f32>(0.0, 0.0, 0.0);

    // Loop over the lights in the cluster
    for (var i: u32 = 0u; i < numLights; i = i + 1u) {
        // Get the light index from the cluster's light list
        let lightIndex = clusterLights[clusterOffset + 1u + i];
        let light = lightSet.lights[lightIndex];

        // Calculate the light contribution
        totalLightContrib += calculateLightContrib(light, worldPos, normal);
    }

    // Compute the final color
    let finalColor = albedo * totalLightContrib;
    return vec4(finalColor, 1.0);
}

// Helper function to determine the cluster ID
fn getClusterID(viewPos: vec3<f32>) -> u32 {
    // Compute NDC position
    let clipPos = cameraUniforms.projMat * vec4<f32>(viewPos, 1.0);
    let ndcPos = clipPos.xyz / clipPos.w;

    // Compute cluster indices based on NDC coordinates
    let xCluster = u32(clamp(floor((ndcPos.x + 1.0) * 0.5 * f32(NUM_CLUSTERS_X)), 0.0, f32(NUM_CLUSTERS_X - 1u)));
    let yCluster = u32(clamp(floor((ndcPos.y + 1.0) * 0.5 * f32(NUM_CLUSTERS_Y)), 0.0, f32(NUM_CLUSTERS_Y - 1u)));

    // Compute depth cluster using logarithmic depth slicing
    let depth = -viewPos.z;
    let nearPlane = cameraUniforms.params.x;
    let farPlane = cameraUniforms.params.y;
    let logDepth = log(depth / nearPlane) / log(farPlane / nearPlane);
    let zCluster = u32(clamp(floor(logDepth * f32(NUM_CLUSTERS_Z)), 0.0, f32(NUM_CLUSTERS_Z - 1u)));

    // Calculate the final cluster ID
    let clusterID = xCluster + yCluster * NUM_CLUSTERS_X + zCluster * NUM_CLUSTERS_X * NUM_CLUSTERS_Y;
    return clusterID;
}