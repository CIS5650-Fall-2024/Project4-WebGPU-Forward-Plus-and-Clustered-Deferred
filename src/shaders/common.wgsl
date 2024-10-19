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
    numLights: u32,
    lights: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    clusters: array<Cluster, ${numClusterX} * ${numClusterY} * ${numClusterZ}>
}

struct CameraUniforms {
    // TODO-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewproj : mat4x4f,
    view : mat4x4f,
    proj : mat4x4f,
    projInv : mat4x4f,
    clipPlanes : vec2<f32>,
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

fn applyTransform(point: vec4<f32>, transform: mat4x4<f32>) -> vec3<f32> {
    let transformed = transform * point;
    return transformed.xyz / transformed.w;
}

// gpu gems p335
fn intersectionTest(Sphere: vec3<f32>, radius: f32, CornerOne: vec3<f32>, CornerTwo: vec3<f32>) -> bool {
    var radius_squared = radius * radius;
    let closestPoint = clamp(Sphere, CornerOne, CornerTwo);
    let vecToClosestPoint = closestPoint - Sphere;
    let distanceSquared = dot(vecToClosestPoint, vecToClosestPoint);
    return distanceSquared <= radius_squared;
}