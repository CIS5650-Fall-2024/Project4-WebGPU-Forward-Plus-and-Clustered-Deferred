// TODO-3: implement the Clustered Deferred fullscreen fragment shader

struct FragmentInput {
    @location(0) fragUV: vec2<f32>,
};

@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(1) @binding(0) var diffuseTex: texture_2d<f32>;
@group(1) @binding(1) var diffuseTexSampler: sampler;
@group(1) @binding(2) var gNormalTexture: texture_2d<f32>;
@group(1) @binding(3) var gNormalTextureSampler: sampler;
@group(1) @binding(4) var gDepthTexture: texture_depth_2d;
@group(1) @binding(5) var depthSampler: sampler;

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    // Flip the Y-coordinate
    let uv = vec2<f32>(input.fragUV.x, 1.0 - input.fragUV.y);

    // Sample textures using the flipped UV
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, uv);
    let normal = textureSample(gNormalTexture, gNormalTextureSampler, uv).xyz;
    // Note: For depth textures, use textureSample instead of textureSampleCompare
    let depth = textureSample(gDepthTexture, depthSampler, uv);

    var clusterX = u32(floor(input.fragUV.x * f32(clusterSet.numClustersX)));
    var clusterY = u32(floor(input.fragUV.y * f32(clusterSet.numClustersY)));
    clusterX = clamp(clusterX, 0u, clusterSet.numClustersX - 1u);
    clusterY = clamp(clusterY, 0u, clusterSet.numClustersY - 1u);

    let ndcPos = vec3<f32>(input.fragUV * 2.0 - 1.0, depth);
    let clipSpacePosition = vec4<f32>(ndcPos, 1.0);
    let worldPosH = cameraUniforms.invViewProjMat * clipSpacePosition;
    let worldPos = worldPosH.xyz / worldPosH.w;
    let viewPos = (cameraUniforms.viewMat * vec4(worldPos, 1.0)).xyz;
    let zNear = cameraUniforms.nearPlane;
    let zFar = cameraUniforms.farPlane;
    let sliceCount = clusterSet.numClustersZ;
    let viewZ = -viewPos.z;
    let viewZClamped = clamp(viewZ, zNear, zFar);
    let logDepthRatio = log(zFar / zNear);
    let clusterZf = (log(viewZClamped / zNear) / logDepthRatio) * f32(sliceCount);
    var clusterZ = u32(floor(clusterZf));
    clusterZ = clamp(clusterZ, 0u, clusterSet.numClustersZ - 1u);

    var clusterIndex = clusterX + 
                       clusterY * clusterSet.numClustersX + 
                       clusterZ * clusterSet.numClustersX * clusterSet.numClustersY;

    let maxClusterIndex = clusterSet.numClustersX * clusterSet.numClustersY * clusterSet.numClustersZ - 1u;
    clusterIndex = clamp(clusterIndex, 0, maxClusterIndex);
    let cluster = clusterSet.clusters[clusterIndex];

    let numLightsInCluster = cluster.lightCount;
    var totalLightContrib = vec3f(0.0, 0.0, 0.0);
    for (var i = 0u; i < numLightsInCluster; i++) {
        let lightIndex = cluster.lightIndices[i];
        let light = lightSet.lights[lightIndex];
        let lightContrib = calculateLightContrib_Deferred(light, worldPos, normal);
        totalLightContrib += lightContrib;
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1.0);
}

fn rangeAttenuation_Deferred(distance: f32) -> f32 {
    return clamp(1.f - pow(distance / ${lightRadius}, 4.f), 0.f, 1.f) / (distance * distance);
}

fn calculateLightContrib_Deferred(light: Light, posWorld: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = light.pos - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation_Deferred(distToLight);
}
