// CHECKITOUT: code that you add here will be prepended to all shaders

struct Light {
    pos: vec3f,
    color: vec3f
}

struct LightSet {
    numLights: u32,
    lights: array<Light>
}

struct ClusterSet {
    light_indices: array<u32>
}

struct CameraUniforms {
    viewProj: mat4x4f,
    inv_view_proj: mat4x4f,
    near_plane: f32,
    far_plane: f32
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

fn prod(vector: vec3u) -> u32 {
    return vector.x * vector.y * vector.z;
}

fn compute_cluster_index(position: vec3f, camera_uniforms: CameraUniforms, cluster_grid_dimensions: vec3u) -> vec3u {
    let clip_space_coordinates = camera_uniforms.viewProj * vec4(position, 1.0f);
    let normalized_screen_space = clip_space_coordinates.xy / clip_space_coordinates.w * 0.5f + 0.5f;
    let normalized_depth = log(clip_space_coordinates.z / camera_uniforms.near_plane) / log(camera_uniforms.far_plane / camera_uniforms.near_plane); 
    return vec3u(floor(clamp(vec3f(normalized_screen_space.x, normalized_screen_space.y, normalized_depth), vec3f(0.0f), vec3f(1.0f)) * vec3f(cluster_grid_dimensions)));
}

fn flatten_index(index: vec3u, grid_dimensions: vec3u) -> u32 {
    return index.x + index.y * grid_dimensions.x + index.z * grid_dimensions.x * grid_dimensions.y;
}

fn unflatten_index(index: u32, grid_dimensions: vec3u) -> vec3u {
    return vec3u(
        index % grid_dimensions.x,
        (index / grid_dimensions.x) % grid_dimensions.y,
        (index / (grid_dimensions.x * grid_dimensions.y))
    );
}

fn pack_color(color: vec3f) -> f32 {
    // Convert each channel from 0.0 - 1.0 range to 0 - 255 range and cast to u32
    let r = u32(color.r * 255.0);
    let g = u32(color.g * 255.0);
    let b = u32(color.b * 255.0);

    // Pack the channels into a single u32
    let packed: u32 = (r << 16) | (g << 8) | b;

    // Normalize to [0.0, 1.0] by dividing by the max 24-bit value (16777215)
    return f32(packed) / 16777215.0;
}

fn unpack_color(packed_color: f32) -> vec3f {
    // Convert back from the normalized float to the packed u32 value
    let packed: u32 = u32(packed_color * 16777215.0);

    // Extract each channel by shifting and masking
    let r = (packed >> 16) & 0xFF;
    let g = (packed >> 8) & 0xFF;
    let b = packed & 0xFF;

    // Convert each channel back to the 0.0 - 1.0 range
    return vec3f(f32(r) / 255.0, f32(g) / 255.0, f32(b) / 255.0);
}

fn world_from_uv(uv: vec2f, depth: f32, camera_uniforms: CameraUniforms) -> vec3f {
    let clip_space_pos = vec4f(uv.x * 2.0f - 1.0f, (1.0f - uv.y) * 2.0f - 1.0f, depth, 1.0f);
    let world_space_pos = camera_uniforms.inv_view_proj * clip_space_pos;
    return world_space_pos.xyz / world_space_pos.w;
}