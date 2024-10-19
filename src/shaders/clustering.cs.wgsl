@group(0) @binding(0) var<uniform> cluster_grid_dimensions: vec4u;
@group(0) @binding(1) var<uniform> camera_uniforms: CameraUniforms;
@group(0) @binding(2) var<storage, read> light_set: LightSet;
@group(0) @binding(3) var<storage, read_write> cluster_indices: ClusterSet;

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.

@compute
@workgroup_size(${moveLightsWorkgroupSize})
fn main(@builtin(global_invocation_id) index: vec3u) {
    if (index.x > prod(cluster_grid_dimensions.xyz)) {
        return;
    }

    let light_cluster_index = unflatten_index(index.x, cluster_grid_dimensions.xyz);
    let cluster_start = index.x * cluster_grid_dimensions.w;

    var cluster_num_lights = 0u;

    for (var l = 0u; l < light_set.numLights; l++) {
        let light = light_set.lights[l];

        var min_corner_cluster_index = vec3u((1 << 32) - 1);
        var max_corner_cluster_index = vec3u(0u);

        for (var x = -${lightRadius}; x <= ${lightRadius}; x += 2 * ${lightRadius}) {
            for (var y = -${lightRadius}; y <= ${lightRadius}; y += 2 * ${lightRadius}) {
                for (var z = -${lightRadius}; z <= ${lightRadius}; z += 2 * ${lightRadius}) {
                    let light_corner = light.pos + vec3f(f32(x), f32(y), f32(z));
                    let light_corner_cluster_index = compute_cluster_index(
                        light_corner,
                        camera_uniforms,
                        cluster_grid_dimensions.xyz
                    );
                    min_corner_cluster_index = min(light_corner_cluster_index, min_corner_cluster_index);
                    max_corner_cluster_index = max(light_corner_cluster_index, max_corner_cluster_index);
                }
            }
        }
        
        if (any(min_corner_cluster_index > light_cluster_index) || any(light_cluster_index > max_corner_cluster_index)) {
            continue;
        }

        cluster_indices.light_indices[cluster_start + cluster_num_lights] = l;
        cluster_num_lights += 1;
        if (cluster_num_lights >= cluster_grid_dimensions.w) {
            break;
        }
    }

    if (cluster_num_lights < cluster_grid_dimensions.w) {
        cluster_indices.light_indices[cluster_start + cluster_num_lights] = (1 << 32) - 1; // SENTINEL
    }

}