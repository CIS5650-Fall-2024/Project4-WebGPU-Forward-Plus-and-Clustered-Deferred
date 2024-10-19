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
const CLUSTER_DIMENSIONS = vec3u(${clusterDimensions.x}, ${clusterDimensions.y}, ${clusterDimensions.z});

struct AABB {
    min: vec3f,
    max: vec3f
}

struct Cluster {
    viewSpaceBbox: AABB,
    numLights: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}u>
}

struct ClusterSet {
    clusters: array<Cluster>
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProj: mat4x4<f32>,
    view: mat4x4<f32>,
    proj: mat4x4<f32>,
    invProj: mat4x4<f32>,
    screenSize: vec2<f32>,
    nearAndFar: vec2<f32>
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
