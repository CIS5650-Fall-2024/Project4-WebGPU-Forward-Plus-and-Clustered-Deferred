// CHECKITOUT: code that you add here will be prepended to all shaders
const FLOAT_MAX: f32 = bitcast<f32>(0x7F7FFFFFu); // Maximum positive finite float
const FLOAT_MIN: f32 = -bitcast<f32>(0x7F7FFFFFu); // Maximum negative finite float

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// Light indices has to have a fixed array size in order to be nested in ClusterSet
struct Cluster {
    lightCount: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    clusters: array<Cluster, ${clusterDimensions[0]} * ${clusterDimensions[1]} * ${clusterDimensions[2]}>
}

struct ClusterUniforms {
    clusterDims: vec3f
}

struct CameraUniforms {
    viewProjMat: mat4x4f,
    invProjMat: mat4x4f,
    viewMat: mat4x4f,
    invViewMat: mat4x4f,
    screenDims: vec2f,
    near: f32,
    far: f32,
    logFarOverNear: f32,
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
