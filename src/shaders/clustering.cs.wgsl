// TODO: Implement the light clustering compute shader

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

// ------------------------------------
// Cluster Bound Calculation:
// ------------------------------------
// 1. For each cluster (X, Y, Z):
//     - Calculate the 2D screen-space bounds for this cluster (XY).
//     - Determine the depth bounds for this cluster in Z (using near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.
//
// Light Assignment to Clusters:
// ------------------------------------
// 1. Initialize a counter for lights in the cluster.
// 2. For each light:
//     - Check if the light intersects with the cluster’s bounding box (AABB).
//     - If it does, add the light to the cluster's list.
//     - Stop adding lights if the maximum allowed per cluster is reached.
// 3. Store the number of lights assigned to the cluster.

@compute
@workgroup_size(${workgroupSizeX}, ${workgroupSizeY}, ${workgroupSizeZ}) // Adjustable workgroup size
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    // Ensure the index is within valid cluster range.
    if (globalIdx.x >= ${numClusterX} || globalIdx.y >= ${numClusterY} || globalIdx.z >= ${numClusterZ}) {
        return;
    }

    // Calculate the linear index for the cluster.
    let clusterIdx = globalIdx.x + globalIdx.y * ${numClusterX} + globalIdx.z * ${numClusterY} * ${numClusterX};

    // Calculate screen-space bounds (XY) for the cluster.
    let minX = -1.0 + 2.0 * f32(globalIdx.x) / f32(${numClusterX});
    let maxX = -1.0 + 2.0 * f32(globalIdx.x + 1) / f32(${numClusterX});
    let minY = -1.0 + 2.0 * f32(globalIdx.y) / f32(${numClusterY});
    let maxY = -1.0 + 2.0 * f32(globalIdx.y + 1) / f32(${numClusterY});

    // Calculate depth bounds (Z) using view-space depth values.
    let minZView = -cameraUniforms.clipPlanes[0] * exp(f32(globalIdx.z) * 
                  log(cameraUniforms.clipPlanes[1] / cameraUniforms.clipPlanes[0]) / f32(${numClusterZ}));
    let maxZView = -cameraUniforms.clipPlanes[0] * exp(f32(globalIdx.z + 1) * 
                  log(cameraUniforms.clipPlanes[1] / cameraUniforms.clipPlanes[0]) / f32(${numClusterZ}));
    let minZ = (cameraUniforms.proj[2][2] * minZView + cameraUniforms.proj[3][2]) / 
               (cameraUniforms.proj[2][3] * minZView + cameraUniforms.proj[3][3]);
    let maxZ = (cameraUniforms.proj[2][2] * maxZView + cameraUniforms.proj[3][2]) / 
               (cameraUniforms.proj[2][3] * maxZView + cameraUniforms.proj[3][3]);

    // Convert bounds from screen space to view space, then find the AABB.
    let screenSpaceCorners = array<vec4<f32>, 8u>(
        vec4(minX, minY, minZ, 1.0), vec4(minX, minY, maxZ, 1.0),
        vec4(minX, maxY, minZ, 1.0), vec4(minX, maxY, maxZ, 1.0),
        vec4(maxX, minY, minZ, 1.0), vec4(maxX, minY, maxZ, 1.0),
        vec4(maxX, maxY, minZ, 1.0), vec4(maxX, maxY, maxZ, 1.0)
    );

    var minAABB = vec3<f32>(1e10, 1e10, 1e10);
    var maxAABB = vec3<f32>(-1e10, -1e10, -1e10);

    for (var i = 0; i < 8; i++) {
        let cornerViewSpace = applyTransform(screenSpaceCorners[i], cameraUniforms.projInv).xyz;
        minAABB = min(minAABB, cornerViewSpace);
        maxAABB = max(maxAABB, cornerViewSpace);
    }

    // Initialize a counter for the number of lights in this cluster.
    var numLights: u32 = 0u;
    let cluster = &clusterSet.clusters[clusterIdx];

    // Check each light to see if it intersects the cluster’s AABB.
    let lightRadius = f32(${lightRadius});
    for (var i: u32 = 0u; i < lightSet.numLights; i++) {
        let light = lightSet.lights[i];
        
        // Determine if the light intersects the cluster's AABB.
        if (intersectionTest(applyTransform(vec4(light.pos, 1.0), cameraUniforms.view), 
                             lightRadius, minAABB, maxAABB)) {
            // Add light to the cluster's list if there is an intersection.
            cluster.lights[numLights] = i;
            numLights++;
            
            // Stop if the maximum number of lights for this cluster is reached.
            if (numLights >= ${maxLightsPerCluster}) {
                break;
            }
        }
    }

    // Store the final count of lights assigned to this cluster.
    cluster.numLights = numLights;
}