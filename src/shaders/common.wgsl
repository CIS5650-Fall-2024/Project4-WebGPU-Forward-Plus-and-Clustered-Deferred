// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// struct ClusterIntersection {
//     clusterIdx: u32,
//     lightIdx: u32
// }

struct Cluster {
    minPoint: vec4f,
    maxPoint: vec4f,
    numLights: u32,
    lightIndices: array<u32, ${numLightIndices}>
}

struct ClusterSet {
    numClusters: u32, 
    clusters: array<Cluster>
}

struct CameraUniforms {
    viewProjMat: mat4x4f,
    viewMat: mat4x4f,
    canvasSize: vec2f,
    cameraUp: vec3f,
    cameraRight: vec3f,
    fovRadians: f32,
    aspectRatio: f32,
    projMatInverse: mat4x4f
}

// number of clusters in xyz
const numGrid = vec3<u32>(${clusterSize}); 
const zNear : f32 = 0.1; 
const zFar : f32 = 60.0;    // arbitrary value that fits the sponza scene

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
