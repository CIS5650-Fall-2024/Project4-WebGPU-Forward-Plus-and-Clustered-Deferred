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
@group(${bindGroup_scene}) @binding(0) var<uniform> maxLightsPerCluster: u32;
@group(${bindGroup_scene}) @binding(1) var<uniform> inverseProjMat: mat4x4f;
@group(${bindGroup_scene}) @binding(2) var<uniform> inverseViewMat: mat4x4f;
@group(${bindGroup_scene}) @binding(3) var<storage, read_write> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(4) var<storage, read_write> clusterSet: array<Cluster>;

const clusterPerDim = 16u;

@compute
@workgroup_size(${moveLightsWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx = globalIdx.x;
    if (clusterIdx >= clusterPerDim * clusterPerDim * clusterPerDim) {
        return;
    }
    // find cluster indx in 3D
    let clusterIdxU = u32(clusterIdx);
    let x_idx = u32(clusterIdxU % clusterPerDim);
    let y_idx = u32((clusterIdxU / clusterPerDim) % clusterPerDim);
    let z_idx = u32(clusterIdxU / (clusterPerDim * clusterPerDim));

    // transform to % of screen size
    var minX = f32(x_idx) / f32(clusterPerDim);
    var maxX = f32(x_idx + 1) / f32(clusterPerDim);
    var minY = f32(y_idx) / f32(clusterPerDim);
    var maxY = f32(y_idx + 1) / f32(clusterPerDim);
    var minZ = f32(z_idx) / f32(clusterPerDim);
    var maxZ = f32(z_idx + 1) / f32(clusterPerDim);

    let corners = array<vec3f, 8>(
        convertToWorldSpace(minX, minY, minZ),
        convertToWorldSpace(maxX, minY, minZ),
        convertToWorldSpace(minX, maxY, minZ),
        convertToWorldSpace(maxX, maxY, minZ),
        convertToWorldSpace(minX, minY, maxZ),
        convertToWorldSpace(maxX, minY, maxZ),
        convertToWorldSpace(minX, maxY, maxZ),
        convertToWorldSpace(maxX, maxY, maxZ)
    );

    // Find the bounding box of the cluster in world space
    var minWorld = corners[0];
    var maxWorld = corners[0];
    for (var i = 1u; i < 8u; i++) {
        minWorld = min(minWorld, corners[i]);
        maxWorld = max(maxWorld, corners[i]);
    }

    let lightRadius = f32(${lightRadius});
    // find the lights that are inside the cluster
    clusterSet[clusterIdx].numLights = 0;
    for (var i = 0u; i < lightSet.numLights; i++) {    
        let light = lightSet.lights[i];
        if (light.pos.x >= minWorld.x - lightRadius && light.pos.x <= maxWorld.x + lightRadius &&
            light.pos.y >= minWorld.y - lightRadius && light.pos.y <= maxWorld.y + lightRadius &&
            light.pos.z >= minWorld.z - lightRadius && light.pos.z <= maxWorld.z + lightRadius  ) {
            let count = clusterSet[clusterIdx].numLights;
            if (count < maxLightsPerCluster) {
                clusterSet[clusterIdx].lightIndices[count] = i;
                clusterSet[clusterIdx].numLights += 1;
            }
        }
    }
}

fn convertToWorldSpace(x: f32, y: f32, z: f32) -> vec3f {
    var ndc = vec3f(x * 2.0 - 1.0, 1.0 - y * 2.0, z); // flip y according to ed

    let clip_coord = vec4f(ndc, 1.0);
    var view_coord = inverseProjMat * clip_coord;

    view_coord /= view_coord.w;

    let world_coord = inverseViewMat * view_coord;
    return world_coord.xyz;
}

