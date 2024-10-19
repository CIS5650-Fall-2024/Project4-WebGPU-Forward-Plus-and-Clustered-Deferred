// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet
struct Cluster {
    lightCount: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    clusters: array<Cluster>
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProj: mat4x4f,
    invViewProj: mat4x4f,
    view: mat4x4f,
    invView: mat4x4f,
    proj: mat4x4f,
    invProj: mat4x4f,
    width: f32,
    height: f32,
    nearPlane: f32,
    farPlane: f32
}

// CHECKITOUT: this special attenuation function ensures lights don't affect geometry outside the maximum light radius
fn rangeAttenuation(distance: f32) -> f32 {
    return clamp(1.f - pow(distance / ${lightRadius}, 4.f), 0.f, 1.f) / (distance * distance);
}

fn calculateLightContrib(light: Light, posWorld: vec3f, nor: vec3f) -> vec3f {
    let vecToLight = light.pos - posWorld;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight);
}

const numClustersX: u32 = ${numClustersX};
const numClustersY: u32 = ${numClustersY};
const numClustersZ: u32 = ${numClustersZ};

fn getClusterIndex(cameraUniforms: CameraUniforms, worldPos: vec3f) -> vec3u {
    var screenPos = cameraUniforms.viewProj * vec4(worldPos, 1.f);

    let depthRatio = log(screenPos.z / cameraUniforms.nearPlane);
    let nearFarRatio = log(cameraUniforms.farPlane / cameraUniforms.nearPlane);
    let depth = clamp(depthRatio / nearFarRatio, 0.f, 1.f);

    if (screenPos.w > 0.f) {
        screenPos /= screenPos.w;
    }
    let ndcPos = screenPos * 0.5f + 0.5f;

    let clusterX = u32(floor(ndcPos.x * f32(numClustersX)));
    let clusterY = u32(floor(ndcPos.y * f32(numClustersY)));
    let clusterZ = u32(floor(depth * f32(numClustersZ)));
    return vec3u(clusterX, clusterY, clusterZ);
}
