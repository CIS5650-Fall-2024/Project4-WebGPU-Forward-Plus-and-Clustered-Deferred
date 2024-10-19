// TODO-2: implement the light clustering compute shader
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

// Function to calculate the NDC z value using the projection matrix
fn convertDepthToNDCWithProjMatrix(depthView: f32) -> f32 {
    // Create a vec4 with the view-space depth value
    let viewSpacePos: vec4<f32> = vec4<f32>(0.0, 0.0, depthView, 1.0);

    // Multiply by the projection matrix to get the clip-space position
    let clipSpacePos: vec4<f32> = cameraUniforms.proj * viewSpacePos;

    // Perform the perspective divide (divide by w)
    // and return the NDC z value
    return clipSpacePos.z / clipSpacePos.w;
}

// Helper function to calculate frustum depth at slice k
// For the depth frustums (Z-axis), divide the space between the near and far planes logarithmically to maintain perspective accuracy:
fn calculateFrustumDepth(n: f32, f: f32, numOfSlices: f32, currentSlice: f32) -> f32 {
    let logDepthRatio: f32 = log(f / n);
    let depthView: f32 = -n * exp(logDepthRatio * (currentSlice / numOfSlices));

    return convertDepthToNDCWithProjMatrix(depthView);
}

fn distanceSquared(a: vec3<f32>, b: vec3<f32>) -> f32 {
    let diff: vec3<f32> = a - b;
    return dot(diff, diff);
}

//     - Store the number of lights assigned to this cluster.
fn sphere_intersects_aabb(sphere_center: vec3<f32>, sphere_radius: f32, box_min: vec3<f32>, box_max: vec3<f32>) -> bool {
    let closest_point: vec3<f32> = clamp(sphere_center, box_min, box_max);
    let distance_squared: f32 = distanceSquared(sphere_center, closest_point);
    return distance_squared < sphere_radius * sphere_radius;
}

const dimYTimesDimZ: u32 = CLUSTER_DIMENSIONS.y * CLUSTER_DIMENSIONS.z;
const dimYTimesDimZInv: f32 = 1.0 / f32(dimYTimesDimZ);
const dimZInv: f32 = 1.0 / f32(CLUSTER_DIMENSIONS.z);  // Pre-calculate inverse for CLUSTER_DIMENSIONS.z

@compute
@workgroup_size(${lightCluserWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx: u32 = globalIdx.x;
    if (clusterIdx >= ${numOfClusters}) {
        return;
    }

    /**
     * Calculate the 3D index (i, j, k) from the 1D cluster index
     * This is the reverse operation of the 3D to 1D conversion
     */
    let clusterIdx_f32 = f32(clusterIdx);  // Convert clusterIdx to float once to avoid redundant casts
    // Replace division by multiplication with the inverse
    let i = u32(floor(clusterIdx_f32 * dimYTimesDimZInv));
    let remainder = clusterIdx - i * dimYTimesDimZ;  
    let remainder_f32 = f32(remainder); 
    let j = u32(floor(remainder_f32 * dimZInv));  
    let k = remainder - j * CLUSTER_DIMENSIONS.z;  
    /******************************************************************************/

    // ------------------------------------
    // Calculating cluster bounds:
    // ------------------------------------
    // For each cluster (X, Y, Z):
    //     - Calculate the screen-space bounds for this cluster in 2D (XY).
    //     - Calculate the depth bounds for this cluster in Z (near and far planes).
    //     - Convert these screen and depth bounds into view-space coordinates.
    //     - Store the computed bounding box (AABB) for the cluster.
        let n = cameraUniforms.nearAndFar.x;
    let f = cameraUniforms.nearAndFar.y;

    // Calculate screen-space NDC coordinates 
    let ndcX_min: f32 = (f32(i) / f32(CLUSTER_DIMENSIONS.x)) * 2.0 - 1.0;
    let ndcX_max: f32 = (f32(i + 1) / f32(CLUSTER_DIMENSIONS.x)) * 2.0 - 1.0;
    let ndcY_min: f32 = (f32(j) / f32(CLUSTER_DIMENSIONS.y)) * 2.0 - 1.0;
    let ndcY_max: f32 = (f32(j + 1) / f32(CLUSTER_DIMENSIONS.y)) * 2.0 - 1.0;

    // Calculate the near and far depth for the current Z slice in NDC
    let zNear = calculateFrustumDepth(n, f, f32(CLUSTER_DIMENSIONS.z), f32(k));
    let zFar = calculateFrustumDepth(n, f, f32(CLUSTER_DIMENSIONS.z), f32(k + 1));

    // Define corner points in NDC space (4 near-plane corners, 4 far-plane corners)
    let ndcCorners: array<vec4<f32>, 8> = array<vec4<f32>, 8>(
        vec4<f32>(ndcX_min, ndcY_min, zNear, 1.0), // Near bottom-left
        vec4<f32>(ndcX_max, ndcY_min, zNear, 1.0), // Near bottom-right
        vec4<f32>(ndcX_min, ndcY_max, zNear, 1.0), // Near top-left
        vec4<f32>(ndcX_max, ndcY_max, zNear, 1.0), // Near top-right
        vec4<f32>(ndcX_min, ndcY_min, zFar, 1.0),  // Far bottom-left
        vec4<f32>(ndcX_max, ndcY_min, zFar, 1.0),  // Far bottom-right
        vec4<f32>(ndcX_min, ndcY_max, zFar, 1.0),  // Far top-left
        vec4<f32>(ndcX_max, ndcY_max, zFar, 1.0)   // Far top-right
    );

    // Transform NDC corners to view-space using the inverse view-projection matrix
    var viewSpaceCorners: array<vec3<f32>, 8>;

    for (var c: u32 = 0; c < 8; c = c + 1) {
        let transformedCorner: vec4<f32> = cameraUniforms.invProj * ndcCorners[c];

        // Perform perspective divide to get 3D coordinates in view space
        viewSpaceCorners[c] = transformedCorner.xyz / transformedCorner.w;
    }

    // Find the min/max for x, y, z to create the bounding box
    var minCoors: vec3<f32> = viewSpaceCorners[0];
    var maxCoors: vec3<f32> = viewSpaceCorners[0];

    for (var c: u32 = 1; c < 8; c = c + 1) {
        let viewSpaceCorner: vec3<f32> = viewSpaceCorners[c];
        minCoors = min(minCoors, viewSpaceCorner);
        maxCoors = max(maxCoors, viewSpaceCorner);
    }
    /******************************************************************************/

    // ------------------------------------
    // Assigning lights to clusters:
    // ------------------------------------
    // For each cluster:
    //     - Initialize a counter for the number of lights in this cluster.

    //     For each light:
    //         - Check if the light intersects with the cluster’s bounding box (AABB).
    //         - If it does, add the light to the cluster's light list.
    //         - Stop adding lights if the maximum number of lights is reached.
    let curBbox = AABB(minCoors, maxCoors);
    var curNumLights: u32 = 0u;
    var curLightIdxArr = array<u32, ${maxLightsPerCluster}u>();
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        if (curNumLights >= ${maxLightsPerCluster}) {
            break;
        }

        let viewSpaceLightPos: vec3<f32> = (cameraUniforms.view * vec4<f32>(lightSet.lights[lightIdx].pos, 1.0)).xyz;
        if (sphere_intersects_aabb(viewSpaceLightPos, ${lightRadius}, curBbox.min, curBbox.max)) {
            curLightIdxArr[curNumLights] = lightIdx;
            curNumLights += 1u;
        }
    }
    /******************************************************************************/

    let cluster: Cluster = Cluster(curBbox, curNumLights, curLightIdxArr);
    clusterSet.clusters[clusterIdx] = cluster;
}
