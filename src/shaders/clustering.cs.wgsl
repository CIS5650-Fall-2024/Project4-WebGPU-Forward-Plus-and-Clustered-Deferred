// TODO-2: implement the light clustering compute shader

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

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusters: array<Cluster>;

fn xy_slice_to_view_1depth(idx: vec2f) -> vec2f {
    return (idx.xy * 2.0 / vec2f(${clusterX}, ${clusterY}) - 1.0) * vec2f(cameraUniforms.xscale, cameraUniforms.yscale);
}

fn z_slice_to_view(zSlice: f32) -> f32 {
    return -cameraUniforms.near * exp(zSlice / ${clusterZ} * cameraUniforms.logfarovernear);
}

fn intersect(c: vec3f, r: f32, minB: vec3f, maxB: vec3f) -> bool {
    var dist = 0.0;
    for (var i: u32 = 0u; i < 3; i++) {
        if (c[i] < minB[i]) {
            dist += (minB[i] - c[i]) * (minB[i] - c[i]);
        } else if (c[i] > maxB[i]) {
            dist += (maxB[i] - c[i]) * (maxB[i] - c[i]);
        }
    }
    return dist < r * r;
}

@compute
@workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    if (globalIdx.x >= ${clusterX} || globalIdx.y >= ${clusterY} || globalIdx.z > ${clusterZ}) {
        return;
    }
    let clusterIdx = globalIdx.x + globalIdx.y * ${clusterX} + globalIdx.z * ${clusterX} * ${clusterY};

    let view_lo = xy_slice_to_view_1depth(vec2f(globalIdx.xy));
    let view_hi = xy_slice_to_view_1depth(vec2f(globalIdx.xy + 1));

    let z_near = z_slice_to_view(f32(globalIdx.z));
    let z_far = z_slice_to_view(f32(globalIdx.z + 1));

    let min_xy = min(view_lo * -z_near, view_lo * -z_far);
    let max_xy = max(view_hi *- z_near, view_hi * -z_far);

    let minB = vec3f(min_xy, z_far);
    let maxB = vec3f(max_xy, z_near);
    
    var numLights = 0u;

    for (var i: u32 = 0u; i < lightSet.numLights; i++) {
        if (intersect(
            (cameraUniforms.view * vec4f(lightSet.lights[i].pos, 1)).xyz,
            ${lightRadius},
            minB,
            maxB)
        ) {
            clusters[clusterIdx].lights[numLights] = i;
            numLights++;
        }
        if (numLights >= ${maxClusterLights}) {
            break;
        }
    }

    clusters[clusterIdx].numLights = numLights;
}

