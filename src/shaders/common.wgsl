// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// DONE-2: you may want to create a ClusterSet struct similar to LightSet
struct Cluster {
    aabbMin: vec3f,
    aabbMax: vec3f,
    lightCount: u32,
    lightIndices: array<u32, ${maxLightsPerCluster}>
}

struct ClusterSet {
    clusterCountX: u32,
    clusterCountY: u32,
    clusterCountZ: u32,
    clusterCount: u32,
    clusters: array<Cluster>
}

struct CameraUniforms {
    // DONE-1.3: add an entry for the view proj mat (of type mat4x4f)
    viewProjMat: mat4x4f,       // View-projection matrix: world space -> clip space

    // DONE-2: add entries for light clustering operations
    invViewProjMat: mat4x4f,    // Inverse view-projection matrix: clip space -> world space
    
    viewMat: mat4x4f,           // View matrix: world space -> view space
    invViewMat: mat4x4f,        // Inverse view matrix: view space -> world space
    projMat: mat4x4f,           // Projection matrix: view space -> clip space
    invProjMat: mat4x4f,        // Inverse projection matrix: clip space -> view space

    nearPlane: f32,             // Near clipping plane in camera (view) space
    farPlane: f32,              // Far clipping plane in camera (view) space
    screenWidth: f32,           // Screen width (in pixels)
    screenHeight: f32,          // Screen height (in pixels)
    cameraPos: vec3f            // Camera position in world space
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
