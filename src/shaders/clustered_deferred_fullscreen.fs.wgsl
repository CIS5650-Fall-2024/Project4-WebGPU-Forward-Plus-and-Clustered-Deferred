// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(0) @binding(0) var<uniform> camera_uniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var gbuffer: texture_2d<f32>;
@group(0) @binding(3) var depth_texture: texture_depth_2d;

@group(1) @binding(0) var<uniform> cluster_grid_dimensions: vec4u;
@group(1) @binding(3) var<storage, read_write> cluster_indices: ClusterSet;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f
{
    let buffer_size = textureDimensions(depth_texture);
    let uv = fragPos.xy / vec2f(buffer_size);
 
    let data = textureLoad(gbuffer, vec2i(floor(fragPos.xy)), 0);
    let normal = data.xyz;
    let color = unpack_color(data.w);

    let depth = textureLoad(depth_texture, vec2i(floor(fragPos.xy)), 0);

    let world_space_pos = world_from_uv(uv, depth, camera_uniforms);

    let cluster_index = compute_cluster_index(world_space_pos, camera_uniforms, cluster_grid_dimensions.xyz);
    let cluster_index_flat = flatten_index(cluster_index, cluster_grid_dimensions.xyz);

    let cluster_start = cluster_index_flat * cluster_grid_dimensions.w;

    var totalLightContrib = vec3f(0, 0, 0);

    for (var cluster_cursor = cluster_start; cluster_cursor < cluster_start + cluster_grid_dimensions.w; cluster_cursor += 1) {
        let l = cluster_indices.light_indices[cluster_cursor];
        if (l == (1 << 32) - 1) {
            break;
        }

        let light = lightSet.lights[l];
        totalLightContrib += calculateLightContrib(light, world_space_pos, normal);
    }

    var finalColor = color.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}
