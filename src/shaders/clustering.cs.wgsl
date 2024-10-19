// TODO-2: implement the light clustering compute shader

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

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
@workgroup_size(${workgroupSizeX}, ${workgroupSizeY}, ${workgroupSizeZ})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    if (globalIdx.x >= ${numClusterX} || globalIdx.y >= ${numClusterY} || globalIdx.z >= ${numClusterZ}) {
        return;
    }

    // For each cluster (X, Y, Z):
    let clusterIdx = globalIdx.x +
                    globalIdx.y * ${numClusterX} +
                    globalIdx.z * ${numClusterY} * ${numClusterX};

    // Calculate the screen-space bounds for this cluster in 2D (XY).
    let minX = -1.0 + 2.0 * f32(globalIdx.x) / f32(${numClusterX});
    let maxX = -1.0 + 2.0 * f32(globalIdx.x + 1) / f32(${numClusterX});
    let minY = -1.0 + 2.0 * f32(globalIdx.y) / f32(${numClusterY});
    let maxY = -1.0 + 2.0 * f32(globalIdx.y + 1) / f32(${numClusterY});

    // Calculate the depth bounds for this cluster in Z (near and far planes).
    let minZView = -cameraUniforms.nearFar[0] * exp(f32(globalIdx.z) * log(cameraUniforms.nearFar[1] / cameraUniforms.nearFar[0]) / f32(${numClusterZ}));
    let maxZView = -cameraUniforms.nearFar[0] * exp(f32(globalIdx.z + 1) * log(cameraUniforms.nearFar[1] / cameraUniforms.nearFar[0]) / f32(${numClusterZ}));

    let minZ = (cameraUniforms.proj[2][2] * minZView + cameraUniforms.proj[3][2]) / (cameraUniforms.proj[2][3] * minZView + cameraUniforms.proj[3][3]);
    let maxZ = (cameraUniforms.proj[2][2] * maxZView + cameraUniforms.proj[3][2]) / (cameraUniforms.proj[2][3] * maxZView + cameraUniforms.proj[3][3]);

    // Convert these screen and depth bounds into view-space coordinates.
    let lbn = applyTransform(vec4(minX, minY, minZ, 1.0), cameraUniforms.projInv);
    let lbf = applyTransform(vec4(minX, minY, maxZ, 1.0), cameraUniforms.projInv);
    let ltn = applyTransform(vec4(minX, maxY, minZ, 1.0), cameraUniforms.projInv);
    let ltf = applyTransform(vec4(minX, maxY, maxZ, 1.0), cameraUniforms.projInv);
    let rbn = applyTransform(vec4(maxX, minY, minZ, 1.0), cameraUniforms.projInv);
    let rbf = applyTransform(vec4(maxX, minY, maxZ, 1.0), cameraUniforms.projInv);
    let rtn = applyTransform(vec4(maxX, maxY, minZ, 1.0), cameraUniforms.projInv);
    let rtf = applyTransform(vec4(maxX, maxY, maxZ, 1.0), cameraUniforms.projInv);

    // Store the computed bounding box (AABB) for the cluster.
    let minBB = min(min(min(min(min(min(min(lbn, lbf), rbn), rbf), ltn), ltf), rtn), rtf);
    let maxBB = max(max(max(max(max(max(max(lbn, lbf), rbn), rbf), ltn), ltf), rtn), rtf);

    // Initialize a counter for the number of lights in this cluster.
    var numLights : u32 = 0u;

    let ptr = &clusterSet.clusters[clusterIdx];
    // For each light:
    let r = f32(${lightRadius});
    for (var i: u32 = 0u; i < lightSet.numLights; i++) {
        let light = lightSet.lights[i];
        // Check if the light intersects with the cluster’s bounding box (AABB).
        if (intersectionTest(applyTransform(vec4(light.pos, 1.0), cameraUniforms.view), r, minBB, maxBB)) {
            // If it does, add the light to the cluster's light list.
            ptr.lights[numLights] = i;
            numLights++;
        }
        // Stop adding lights if the maximum number of lights is reached.
        if (numLights >= ${maxNumLightsPerCluster}) {
            break;
        }
    }

    // Store the number of lights assigned to this cluster.
    ptr.numLights = numLights;
}