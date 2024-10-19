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
    numLights: u32,
    lights: array<u32, ${maxClusterLights}>
}

// TODO-2: you may want to create a ClusterSet struct similar to LightSet

struct CameraUniforms {
    viewProj : mat4x4f,
    view: mat4x4f,
    invViewProj: mat4x4f,
    xscale: f32,
    yscale: f32,
    near: f32,
    logfarovernear: f32
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

fn clusterIdx1d(x: u32, y: u32, z: u32) -> u32 {
    return x + y * ${clusterX} + z * ${clusterX} * ${clusterY};
}

fn zViewToSlice(zView: f32, camera: ptr<uniform, CameraUniforms>) -> u32{
    return u32(log(-zView / camera.near) / camera.logfarovernear * ${clusterZ});
}