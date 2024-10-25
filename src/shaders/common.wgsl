// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

// declare the cluster index data that stores all the indices for all the clusters
struct cluster_index_data {
    indices: array<u32>
};

struct CameraUniforms {
    
    // declare the view-projection matrix
    matrix: mat4x4f,
    
    // declare the camera vector containing the camera properties
    camera: vec4f,
    
    // declare the inverse projection matrix
    inverse_projection: mat4x4f,
    
    // declare the inverse view matrix
    inverse_view: mat4x4f,
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
