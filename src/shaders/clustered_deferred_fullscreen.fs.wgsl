// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.


@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUnif: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

//gBuffer
@group(1) @binding(0) var albedoTex: texture_2d<f32>;
@group(1) @binding(1) var albedoTexSampler: sampler;
@group(1) @binding(2) var normalTex: texture_2d<f32>;
@group(1) @binding(3) var normalTexSampler: sampler;
@group(1) @binding(4) var depthTex: texture_depth_2d;
@group(1) @binding(5) var depthTexSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let uv = vec2<f32>(in.uv.x, 1.0 - in.uv.y);
    let albedo : vec3<f32> = textureSample(albedoTex, albedoTexSampler, uv).xyz;
    let normal : vec3<f32> = textureSample(normalTex, normalTexSampler, uv).xyz;
    let depth : f32 = textureSample(depthTex, depthTexSampler, uv);

    // ------------------------------------
    // Shading process:
    // ------------------------------------
    // Determine which cluster contains the current fragment.
    let clusterDim: vec3<u32> = vec3<u32>(${clusterDim[0]}, ${clusterDim[1]}, ${clusterDim[2]});
    let NDCPos : vec3<f32> = vec3<f32>(uv * 2.0 - 1.0, depth);
    let CSPos: vec4<f32> = cameraUnif.invProjMat * vec4<f32>(NDCPos, 1.0);
    let VSPos : vec4<f32> = CSPos / CSPos.w;
    let WSPos : vec3<f32> = (cameraUnif.invViewMat * VSPos).xyz;
    let clusterZ : u32 = u32((log(abs(VSPos.z) / zNear) * f32(clusterDim.z)) / log(zFar / zNear));
    let clusterX : u32 = u32(uv.x * f32(clusterDim.x));
    let clusterY : u32 = u32(uv.y * f32(clusterDim.y));
    let clusterIdx : u32 = clusterX + clusterY * clusterDim.x + clusterZ * clusterDim.x * clusterDim.y;
    let cluster = &(clusterSet.clusters[clusterIdx]);
    
    // Retrieve the number of lights that affect the current fragment from the cluster’s data.
    let numLights : u32 = cluster.numLights;

    // Initialize a variable to accumulate the total light contribution for the fragment.
    var totalLightContrib = vec3f(0, 0, 0);

    // For each light in the cluster:
    for (var idx = 0u; idx < numLights; idx++) {
        let lightIdx = cluster.indices[idx];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, WSPos, normal);
    }

    var finalColor = albedo * totalLightContrib;
    return vec4(finalColor, 1);
}