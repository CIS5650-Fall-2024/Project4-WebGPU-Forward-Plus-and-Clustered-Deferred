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

const NUM_CLUSTERS_X: u32 = 16;
const NUM_CLUSTERS_Y: u32 = 9;
const NUM_CLUSTERS_Z: u32 = 24;

// Fragment Inputs
struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
};

fn getClusterIndex(fragPos: vec3f) -> u32 
{
    // pre-compute
    let screenPos = cameraUniforms.viewProjMat * vec4f(fragPos, 1.0);
    let posView = cameraUniforms.viewMat * vec4f(fragPos, 1.0);
    let zDepth = posView.z;
    let far = cameraUniforms.far;
    let near = cameraUniforms.near;

    // convert fragPos to normalized device coord
    let ndcPos = screenPos.xyz / screenPos.w;

    // Cluster X and Y calculation
    let clusterX = u32((ndcPos.x + 1.0) * 0.5 * f32(NUM_CLUSTERS_X));
    let clusterY = u32((ndcPos.y + 1.0) * 0.5 * f32(NUM_CLUSTERS_Y));

    // Cluster Z calculation based on depth
    let logA = log(abs(zDepth) / near);
    let logB = log(far / near);
    let temp = logA / logB;
    let clusterZ = u32(temp * f32(NUM_CLUSTERS_Z));

    // Compute the final cluster index
    let ret = clusterZ * u32(NUM_CLUSTERS_X) * u32(NUM_CLUSTERS_Y) + clusterY * u32(NUM_CLUSTERS_X) + clusterX;
    return ret;
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f 
{   
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, input.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }
    // accumulate light contributions
    var accumulatedLight = vec3f(0, 0, 0);
    let clusterIndex = getClusterIndex(input.pos);
    let cluster = &(clusterSet.clusters[clusterIndex]);

    for (var i = 0u; i < (*cluster).numLights; i++) {
        let lightIndex = (*cluster).lights[i];
        let light = lightSet.lights[lightIndex]; 
        
        // Skip light if too far or contribution is negligible
        let lightDir = normalize(light.pos - input.pos);
        let attenuation = max(dot(input.nor, lightDir), 0.0);
        if (attenuation < 0.01) {
            continue; 
        }
        accumulatedLight += calculateLightContrib(light, input.pos, input.nor);
    }
    // multiply the diffuse color
    let finalColor = diffuseColor.rgb * accumulatedLight;

    // debug
    //let colorDebug = f32(clusterIndex) / f32(${clusterXsize} * ${clusterYsize} * ${clusterZsize});
    //let debug_n = f32(cluster.numLights) / f32(${maxLightsPerTile});
    //return vec4(debug_n, debug_n, debug_n, 1.0);
    //return vec4(colorDebug, colorDebug, colorDebug, 1.0);
    return vec4(finalColor, 1.0);
} 
