// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f,
    radius: f32,
    intensity: f32
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet

struct Cluster {
    numLights: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>,
};

struct ClusterGridMetadata {
    clusterGridSizeX: u32,
    clusterGridSizeY: u32,
    clusterGridSizeZ: u32,
    canvasWidth: u32,

    canvasHeight: u32,
    padding1: vec3<f32>,
};

struct CameraUniforms {
    viewProjMat: mat4x4<f32>,
    invViewProjMat: mat4x4<f32>,
    viewMat: mat4x4<f32>,
    projMat: mat4x4<f32>,
    invProjMat: mat4x4<f32>,
    cameraPos: vec3<f32>,
    padding: f32,
    zNear: f32,
    zFar: f32
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
