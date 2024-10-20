// DONE-2: implement the light clustering compute shader

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
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

struct ClusterBounds
{
    aabbMin: vec3f,
    aabbMax: vec3f
}

// Function to compute the AABB for a cluster in view space
fn computeClusterBounds(clusterIdx: u32) -> ClusterBounds
{
    let clusterIdx_x: u32 = clusterIdx % clusterSet.clusterCountX;
    let clusterIdx_y: u32 = (clusterIdx / clusterSet.clusterCountX) % clusterSet.clusterCountY;
    let clusterIdx_z: u32 = clusterIdx / (clusterSet.clusterCountX * clusterSet.clusterCountY);

    // Calculate the screen-space bounds for this cluster in 2D (XY)
    let ndc_width:  f32 = 2.0 / f32(clusterSet.clusterCountX);
    let ndc_height: f32 = 2.0 / f32(clusterSet.clusterCountY);
    let ndc_min_x:  f32 = -1.0 + f32(clusterIdx_x) * ndc_width;
    let ndc_min_y:  f32 = -1.0 + f32(clusterIdx_y) * ndc_height;
    let ndc_max_x:  f32 = min(ndc_min_x + ndc_width, 1.0);
    let ndc_max_y:  f32 = min(ndc_min_y + ndc_height, 1.0);

    // Calculate the depth bounds for this cluster in Z (near and far planes)
    let view_depth_step: f32 = pow(cameraUniforms.farPlane / cameraUniforms.nearPlane, 1.0 / f32(clusterSet.clusterCountZ));
    let view_min_z:  f32 = cameraUniforms.nearPlane * pow(view_depth_step, f32(clusterIdx_z));
    let view_max_z:  f32 = view_min_z * view_depth_step;

    let clip_min_z:  f32 = cameraUniforms.projMat[2][2] * view_min_z + cameraUniforms.projMat[3][2];
    let clip_min_w:  f32 = cameraUniforms.projMat[2][3] * view_min_z + cameraUniforms.projMat[3][3];
    let clip_max_z:  f32 = cameraUniforms.projMat[2][2] * view_max_z + cameraUniforms.projMat[3][2];
    let clip_max_w:  f32 = cameraUniforms.projMat[2][3] * view_max_z + cameraUniforms.projMat[3][3];

    let ndc_min_z:   f32 = clip_min_z / clip_min_w;
    let ndc_max_z:   f32 = clip_max_z / clip_max_w;

    // Convert these screen and depth bounds into view-space coordinates and determine (AABB) for the cluster
    var view_min: vec3f = vec3f(1e10, 1e10, 1e10);
    var view_max: vec3f = vec3f(-1e10, -1e10, -1e10);

    let ndc_corners: array<vec4f, 8> = array<vec4f, 8>(
        vec4f(ndc_min_x, ndc_min_y, ndc_min_z, 1.0),
        vec4f(ndc_min_x, ndc_min_y, ndc_max_z, 1.0),
        vec4f(ndc_min_x, ndc_max_y, ndc_min_z, 1.0),
        vec4f(ndc_min_x, ndc_max_y, ndc_max_z, 1.0),
        vec4f(ndc_max_x, ndc_min_y, ndc_min_z, 1.0),
        vec4f(ndc_max_x, ndc_min_y, ndc_max_z, 1.0),
        vec4f(ndc_max_x, ndc_max_y, ndc_min_z, 1.0),
        vec4f(ndc_max_x, ndc_max_y, ndc_max_z, 1.0)
    );

    for (var i = 0u; i < 8u; i++)
    {
        let view_pos: vec4f = cameraUniforms.invProjMat * ndc_corners[i];
        let view_corner: vec3f = view_pos.xyz / view_pos.w;
        view_min = min(view_min, view_corner);
        view_max = max(view_max, view_corner);
    }

    return ClusterBounds(view_min, view_max);
}

// Function to check if a light (as a sphere) intersects a cluster's AABB
fn sphereAabbIntersectionTest(c: vec3f, r: f32, aabbMin: vec3f, aabbMax: vec3f) -> bool
{
    let closestPoint = clamp(c, aabbMin, aabbMax);
    // Returns true if the distance from the sphere center to the closest point on the AABB is less than or equal to the sphere's radius
    return length(c - closestPoint) <= r;
}

@compute
@workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u)
{
    let clusterIdx: u32 = globalIdx.x;
    if (clusterIdx >= clusterSet.clusterCount) {
        return;
    }

    // ------------------------------------
    // Compute the AABB for this cluster in view space
    // ------------------------------------
    let clusterBounds: ClusterBounds = computeClusterBounds(clusterIdx);
    let aabbMin: vec3f = clusterBounds.aabbMin;
    let aabbMax: vec3f = clusterBounds.aabbMax;

    // Store the computed bounding box (AABB) for the cluster
    clusterSet.clusters[clusterIdx].aabbMin = aabbMin;
    clusterSet.clusters[clusterIdx].aabbMax = aabbMax;

    // ------------------------------------
    // Assign lights to the current cluster
    // ------------------------------------

    // Initialize a counter for the number of lights in this cluster
    var cluster_lightCount: u32 = 0u;
    // var cluster_lightIndices: array<u32, ${maxLightsPerCluster}> = array<u32, ${maxLightsPerCluster}>();

    // For each light
    for (var lightIdx: u32 = 0u; lightIdx < lightSet.numLights; lightIdx++)
    {
        let view_light_pos: vec4f = cameraUniforms.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1.0);

        // Check if the light intersects with the cluster’s bounding box (AABB)
        if (sphereAabbIntersectionTest(view_light_pos.xyz, ${lightRadius}, aabbMin, aabbMax))
        {
            // Add this light to the cluster's light list if there is space
            if (cluster_lightCount < ${maxLightsPerCluster})
            {
                // cluster_lightIndices[cluster_lightCount] = lightIdx;
                clusterSet.clusters[clusterIdx].lightIndices[cluster_lightCount] = lightIdx;
                cluster_lightCount++;
            }
            else
            {
                // Stop early if the cluster's light list is full
                break;
            }
        }
    }

    // Store the number of lights assigned to this cluster
    clusterSet.clusters[clusterIdx].lightCount = cluster_lightCount;

    // Update this cluster's light list
    // if (cluster_lightCount > 0u) {
    //     for (var i: u32 = 0u; i < cluster_lightCount; i++) {
    //         clusterSet.clusters[clusterIdx].lightIndices[i] = cluster_lightIndices[i];
    //     }
    // }
}