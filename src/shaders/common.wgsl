// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

struct Cluster {
    minPos: vec3f,
    maxPos: vec3f,
    numLights: u32,
    lightInx: array<u32, ${maxLightsNumPerCluster}>
}

struct ClusterSet {
    tileNum: u32,
    tileNumX: u32,
    tileNumY: u32,
    tileNumZ: u32,
    clusters: array<Cluster>
}

struct CameraUniforms {
    projMat: mat4x4f,
    invProjMat: mat4x4<f32>,
    viewMat: mat4x4<f32>,
    invViewMat: mat4x4<f32>,
    viewProjMat: mat4x4<f32>,
    invViewProjMat: mat4x4<f32>,
    xdim: f32,
    ydim: f32,
    nclip: f32,
    fclip: f32,
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
