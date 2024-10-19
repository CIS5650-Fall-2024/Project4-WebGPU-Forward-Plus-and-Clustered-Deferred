// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

@group(${bindGroup_fullscreen}) @binding(0) var depthTex: texture_depth_2d;
@group(${bindGroup_fullscreen}) @binding(1) var depthTexSampler: sampler;
@group(${bindGroup_fullscreen}) @binding(2) var albedoTex: texture_2d<f32>;
@group(${bindGroup_fullscreen}) @binding(3) var albedoTexSampler: sampler;
@group(${bindGroup_fullscreen}) @binding(4) var normalTex: texture_2d<f32>;
@group(${bindGroup_fullscreen}) @binding(5) var normalTexSampler: sampler;

struct FragmentInput {
    @location(0) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let uv = vec2f(in.uv.x, 1.0 - in.uv.y);
    let depth = textureSample(depthTex, depthTexSampler,uv);
    let normal = textureSample(normalTex, normalTexSampler, uv).xyz;
    let albedo = textureSample(albedoTex, albedoTexSampler ,uv);

    if (albedo.a < 0.5) {
        discard;
    }

    var clusterX = u32(floor(in.uv.x * f32(clusterSet.nx)));
    var clusterY = u32(floor(in.uv.y * f32(clusterSet.ny)));
    clusterX = clamp(clusterX, 0u, clusterSet.nx - 1u);
    clusterY = clamp(clusterY, 0u, clusterSet.ny - 1u);

    // Prefetch
    let ndc = vec4f(in.uv * 2.0 - 1.0, depth, 1.0);
    let worldPos = cameraUniforms.invViewProjMat * ndc;
    let pos = worldPos.xyz / worldPos.w;
    let viewPos = (cameraUniforms.viewMat * vec4(pos, 1.0)).xyz;
    let zView = viewPos.z; 
    let zNear = cameraUniforms.nearClip;
    let zFar = cameraUniforms.farClip;
    let nz = f32(clusterSet.nz);

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
        totalLightContrib += calculateLightContrib(light, pos, normal);
    }

    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1.0);
}