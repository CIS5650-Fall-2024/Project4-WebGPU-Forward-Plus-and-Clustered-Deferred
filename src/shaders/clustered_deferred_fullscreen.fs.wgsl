// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_texture}) @binding(0) var positionTex: texture_2d<f32>;
@group(${bindGroup_texture}) @binding(1) var albedoTex: texture_2d<f32>;
@group(${bindGroup_texture}) @binding(2) var normalTex: texture_2d<f32>;
@group(${bindGroup_texture}) @binding(3) var textureSampler: sampler;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) uv: vec2f
}


@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let pos = textureSample(positionTex, textureSampler, in.uv);
    let nor = textureSample(normalTex, textureSampler, in.uv);
    let albedo = textureSample(albedoTex, textureSampler, in.uv);
    
    if (albedo.a < 0.5f) {
        discard;
    }

    let ndcPos = cameraUniforms.viewProjMat * pos;
    let fragPos = ndcPos.xyz / ndcPos.w;

    // // Calculate the cluster index for the current fragment
    let clusterX = u32((0.5 + (fragPos.x * 0.5)) * f32(${numClustersX}));
    let clusterY = u32((0.5 + (fragPos.y * 0.5)) * f32(${numClustersY}));
    let clusterZ = u32(fragPos.z * f32(${numClustersZ}));

    let clusterIdx = clusterX + clusterY * ${numClustersX} + clusterZ * ${numClustersX} * ${numClustersY};

    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < clusterSet.clusters[clusterIdx].numLights; lightIdx++) {
        let light = lightSet.lights[clusterSet.clusters[clusterIdx].lights[lightIdx]];
        totalLightContrib += calculateLightContrib(light, pos.xyz, nor.xyz);
    }

    var finalColor = albedo.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}