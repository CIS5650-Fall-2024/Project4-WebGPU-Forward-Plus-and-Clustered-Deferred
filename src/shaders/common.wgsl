// CHECKITOUT: code that you add here will be prepended to all shaders
const zNear : f32 = 0.1; 
const zFar : f32 = 20.0;

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
    minBounds: vec4<f32>,
    maxBounds: vec4<f32>,
    numLights: u32,
    indices: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    numClusters: u32,
    clusters: array<Cluster>
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4<f32>,
    viewMat: mat4x4<f32>, 
    invProjMat: mat4x4<f32>, 
    invViewMat: mat4x4<f32>, 
    screenDim: vec2<f32>
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
