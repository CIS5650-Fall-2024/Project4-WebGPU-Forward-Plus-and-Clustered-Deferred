// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0) var diffuseTex: texture_2d<f32>;
@group(1) @binding(1) var diffuseTexSampler: sampler;
@group(1) @binding(2) var normalTex: texture_2d<f32>;
@group(1) @binding(3) var normalTexSampler: sampler;
@group(1) @binding(4) var depthTex: texture_depth_2d;
@group(1) @binding(5) var depthTexSampler: sampler;

struct FragmentInput {
    @location(0) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    let normal = textureSample(normalTex, normalTexSampler, in.uv);
    let depth = textureSample(depthTex, depthTexSampler, in.uv);

    let pos = vec4f((in.uv - vec2f(0.5)) * vec2f(2.0, -2.0), depth, 1.f);
    var worldPos = cameraUniforms.invViewProj * pos;
    if (worldPos.w != 0.f) {
        worldPos /= worldPos.w;
    }

    let clusterIndices = getClusterIndex(cameraUniforms, worldPos.xyz);
    let clusterX = clusterIndices.x;
    let clusterY = clusterIndices.y;
    let clusterZ = clusterIndices.z;

    let clusterIndex = clusterX + clusterY * numClustersX + clusterZ * numClustersX * numClustersY;
    let cluster = clusterSet.clusters[clusterIndex];

    var totalLight: vec3f = vec3f(0.f);
    for (var i = 0u; i < cluster.lightCount; i += 1) {
        let lightIndex = cluster.lightIndices[i];
        let light = lightSet.lights[lightIndex];
        totalLight += calculateLightContrib(light, worldPos.xyz, normal.xyz);
    }

    return vec4f(diffuseColor.rgb * totalLight, 1.f);
}
