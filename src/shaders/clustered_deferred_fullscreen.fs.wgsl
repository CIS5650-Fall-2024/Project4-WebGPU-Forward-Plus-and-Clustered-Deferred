// implement the Clustered Deferred fullscreen fragment shader
// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

@group(${bindGroup_model}) @binding(0) var albedoTex: texture_2d<f32>;
@group(${bindGroup_model}) @binding(1) var albedoTexSampler: sampler;

@group(${bindGroup_model}) @binding(2) var normalTex: texture_2d<f32>;
@group(${bindGroup_model}) @binding(3) var normalTexSampler: sampler;

@group(${bindGroup_model}) @binding(4) var depthTex: texture_depth_2d;
@group(${bindGroup_model}) @binding(5) var depthTexSampler: sampler;

const NUM_CLUSTERS_X: u32 = 16;
const NUM_CLUSTERS_Y: u32 = 9;
const NUM_CLUSTERS_Z: u32 = 24;

struct FragmentInput
{
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

fn getClusterIndex(i_uv: vec2f) -> u32 
{
    // pre-compute
    let uv = vec2<f32>(i_uv.x, 1.0 - i_uv.y);
    let depth = textureSample(depthTex, depthTexSampler,uv);
    let ndcPos_world = vec3<f32>(i_uv * 2.0 - 1.0, depth);
    let worldPosH = cameraUniforms.inverseViewMat * cameraUniforms.inverseProjMat * vec4<f32>(ndcPos_world, 1.0);
    let worldPos = worldPosH.xyz/worldPosH.w;

    let screenPos = cameraUniforms.viewProjMat * vec4f(worldPos, 1.0);
    let posView = cameraUniforms.viewMat * vec4f(worldPos, 1.0);
    let ndcPos_screen = screenPos.xyz / screenPos.w;
    let zDepth = posView.z;
    let far = cameraUniforms.far;
    let near = cameraUniforms.near;
    
    // Cluster X and Y calculation
    let clusterX = u32((ndcPos_screen.x + 1.0) * 0.5 * f32(NUM_CLUSTERS_X));
    let clusterY = u32((ndcPos_screen.y + 1.0) * 0.5 * f32(NUM_CLUSTERS_Y));

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
    let uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
    let albedo = textureSample(albedoTex, albedoTexSampler, uv);
    let depth = textureSample(depthTex, depthTexSampler,uv);
    let ndcPos_world = vec3<f32>(input.uv * 2.0 - 1.0, depth);
    
    let worldPosH = cameraUniforms.inverseViewMat * cameraUniforms.inverseProjMat * vec4<f32>(ndcPos_world, 1.0);
    let worldPos = worldPosH.xyz/worldPosH.w;
    let normal = textureSample(normalTex, normalTexSampler, uv);

    // Compute the final cluster index
    let clusterIndex = getClusterIndex(input.uv);
    // debug
    //let colorDebug = f32(clusterIndex) / f32(${clusterXsize} * ${clusterYsize} * ${clusterZsize});
    //return vec4(colorDebug, colorDebug, colorDebug, 1.0);
    let m_cluster = &(clusterSet.clusters[clusterIndex]);
    var accumulatedLight = vec3f(0, 0, 0);
    for (var i = 0u; i < (*m_cluster).numLights; i++) {
        let lightIndex = (*m_cluster).lights[i];
        let light = lightSet.lights[lightIndex];     
        accumulatedLight += calculateLightContrib(light, worldPos, normal.xyz);
    }
    // multiply the diffuse color
    let finalColor = albedo.rgb * accumulatedLight;
    return vec4(finalColor, 1.0);
}