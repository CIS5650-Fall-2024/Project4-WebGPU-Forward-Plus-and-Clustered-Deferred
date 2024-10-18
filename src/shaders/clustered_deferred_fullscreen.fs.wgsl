// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_model}) @binding(0) var albetoTex: texture_2d<f32>;
@group(${bindGroup_model}) @binding(1) var albetoTexSampler: sampler;
@group(${bindGroup_model}) @binding(2) var normalTex: texture_2d<f32>;
@group(${bindGroup_model}) @binding(3) var normalTexSampler: sampler;
@group(${bindGroup_model}) @binding(4) var depthTex: texture_depth_2d;
@group(${bindGroup_model}) @binding(5) var depthTexSampler: sampler;

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f 
{
    // sample texture
    let uvSampler = vec2f(uv.x, 1.0 - uv.y);
    let albeto = textureSample(albetoTex, albetoTexSampler, uvSampler);
    let normal = textureSample(normalTex, normalTexSampler, uvSampler).xyz;
    let depth = textureSample(depthTex, depthTexSampler, uvSampler);

    // compute cluster indices
    let tileX = clamp(u32(uv.x * f32(clusterSet.tileNumX)), 0u, clusterSet.tileNumX - 1);
    let tileY = clamp(u32(uv.y * f32(clusterSet.tileNumY)), 0u, clusterSet.tileNumY - 1);

    let ndcPos = vec3f(uv * 2.0 - 1.0, depth);
    let clipPos = cameraUniforms.invProjMat * vec4f(ndcPos, 1.0);
    let viewPos = clipPos / clipPos.w;
    let logZ = log(-viewPos.z / cameraUniforms.nclip) / log(cameraUniforms.fclip / cameraUniforms.nclip);
    let tileZ = clamp(u32(logZ * f32(clusterSet.tileNumZ)), 0u, clusterSet.tileNumZ - 1);

    // compute world coordinates for shading
    let worldPos = (cameraUniforms.invViewMat * viewPos).xyz;

    // get current cluster
    let clusterIdx = tileX + clusterSet.tileNumX * tileY + clusterSet.tileNumX * clusterSet.tileNumY * tileZ;
    let cluster = clusterSet.clusters[clusterIdx];

    // aggregate light in the cluster
    var totalLightContrib = vec3f(0, 0, 0);
    for (var idx = 0u; idx < cluster.numLights; idx++) {
        let lightIdx = cluster.lightInx[idx];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, worldPos, normal);
    }

    var finalColor = albeto.rgb * totalLightContrib;
    return vec4(finalColor, 1);

    // return vec4(f32(tileX) / f32(clusterSet.tileNumX), f32(tileY) / f32(clusterSet.tileNumY), f32(tileZ) / f32(clusterSet.tileNumZ), 1.0);
    // return vec4(f32(clusterIdx) / f32(clusterSet.tileNum), f32(clusterIdx) / f32(clusterSet.tileNum), f32(clusterIdx) / f32(clusterSet.tileNum), 1.0);
}
