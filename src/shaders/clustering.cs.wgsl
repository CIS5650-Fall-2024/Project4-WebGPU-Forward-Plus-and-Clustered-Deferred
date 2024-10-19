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

// Binding indices
@group(0) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(1) var<storage, read> lightSet: LightSet;
@group(0) @binding(2) var<storage, read_write> clusterSet: array<u32>;

// Constants
const NUM_CLUSTERS_X: u32 = ${numClustersX};
const NUM_CLUSTERS_Y: u32 = ${numClustersY};
const NUM_CLUSTERS_Z: u32 = ${numClustersZ};
const MAX_LIGHTS_PER_CLUSTER: u32 = ${maxLightsPerCluster};
const LIGHT_RADIUS: f32 = ${lightRadius};

@compute
@workgroup_size(${workgroupSizeX}, ${workgroupSizeY}, ${workgroupSizeZ})
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    if (global_id.x >= NUM_CLUSTERS_X || global_id.y >= NUM_CLUSTERS_Y || global_id.z >= NUM_CLUSTERS_Z) {
        return;
    }

    let clusterX = global_id.x;
    let clusterY = global_id.y;
    let clusterZ = global_id.z;

    // Calculate the cluster index
    let clusterIdx = clusterX + clusterY * NUM_CLUSTERS_X + clusterZ * NUM_CLUSTERS_X * NUM_CLUSTERS_Y;
    let clusterOffset = clusterIdx * (1u + MAX_LIGHTS_PER_CLUSTER);

    // Get the camera parameters
    let nearPlane = cameraUniforms.params.x;
    let farPlane = cameraUniforms.params.y;
    let screenWidth = cameraUniforms.params.z;
    let screenHeight = cameraUniforms.params.w;
    let projMat = cameraUniforms.projMat;
    let invProjMat = cameraUniforms.invProjMat;
    let viewMat = cameraUniforms.viewMat;

    // Calculate cluster bounds directly in NDC space
    let NDCX = 2.0 / f32(NUM_CLUSTERS_X);
    let NDCY = 2.0 / f32(NUM_CLUSTERS_Y);

    let minX_NDC = -1.0 + f32(clusterX) * NDCX;
    let maxX_NDC = -1.0 + f32(clusterX + 1u) * NDCX;
    let minY_NDC = -1.0 + f32(clusterY) * NDCY;
    let maxY_NDC = -1.0 + f32(clusterY + 1u) * NDCY;

    // Compute normalized depth values for the current cluster slice
    let sliceDepth = f32(clusterZ) / f32(NUM_CLUSTERS_Z);
    let sliceDepthNext = f32(clusterZ + 1u) / f32(NUM_CLUSTERS_Z);

    // Compute z-values for the near and far planes of the cluster in view space
    let zNear = -nearPlane * pow(farPlane / nearPlane, sliceDepth);
    let zFar = -nearPlane * pow(farPlane / nearPlane, sliceDepthNext);

    // Transform view-space z-values to clip-space z-values
    let zNearClip = projMat * vec4<f32>(0.0, 0.0, zNear, 1.0);
    let zFarClip = projMat * vec4<f32>(0.0, 0.0, zFar, 1.0);
    let minZ_NDC = zNearClip.z / zNearClip.w;
    let maxZ_NDC = zFarClip.z / zFarClip.w;

    // Define the eight corners in clip space
    let corners_clip = array<vec4<f32>, 8>(
        // Near plane (Z = minZ_NDC)
        vec4<f32>(minX_NDC, minY_NDC, minZ_NDC, 1.0), // Bottom-left near
        vec4<f32>(maxX_NDC, minY_NDC, minZ_NDC, 1.0), // Bottom-right near
        vec4<f32>(maxX_NDC, maxY_NDC, minZ_NDC, 1.0), // Top-right near
        vec4<f32>(minX_NDC, maxY_NDC, minZ_NDC, 1.0), // Top-left near
        // Far plane (Z = maxZ_NDC)
        vec4<f32>(minX_NDC, minY_NDC, maxZ_NDC, 1.0), // Bottom-left far
        vec4<f32>(maxX_NDC, minY_NDC, maxZ_NDC, 1.0), // Bottom-right far
        vec4<f32>(maxX_NDC, maxY_NDC, maxZ_NDC, 1.0), // Top-right far
        vec4<f32>(minX_NDC, maxY_NDC, maxZ_NDC, 1.0)  // Top-left far
    );

    // Transform corners to view space
    var corners_view = array<vec3<f32>, 8>();
    for (var i = 0u; i < 8u; i = i + 1u) {
        let corner_view_h = invProjMat * corners_clip[i];
        corners_view[i] = (corner_view_h.xyz / corner_view_h.w);
    }

    // Store the computed bounding box (AABB) for the cluster
    var clusterMin = corners_view[0];
    var clusterMax = corners_view[0];

    for (var i = 0u; i < 8u; i = i + 1u) {
        clusterMin = min(clusterMin, corners_view[i]);
        clusterMax = max(clusterMax, corners_view[i]);
    }

    // Initialize a counter for the number of lights in this cluster
    var numLightsInCluster: u32 = 0u;
    clusterSet[clusterOffset] = 0u;

    // For each light
    for (var i: u32 = 0u; i < lightSet.numLights; i = i + 1u) {
        let light = lightSet.lights[i];

        // Calculate the light position in view-space
        let lightPosView = (viewMat * vec4<f32>(light.pos, 1.0)).xyz;

        // Find the closest point on the AABB to the light's position
        let closestP = clamp(lightPosView, clusterMin, clusterMax);

        // Calculate squared distance between the light and the closest point
        let dis_squ = dot(closestP - lightPosView, closestP - lightPosView);

        // Check if the distance is within the light's radius
        if (dis_squ <= (LIGHT_RADIUS * LIGHT_RADIUS)) {
            if (numLightsInCluster < MAX_LIGHTS_PER_CLUSTER) {
                // Add the light index to the cluster's light list
                let lightIndexOffset = clusterOffset + 1u + numLightsInCluster;
                clusterSet[lightIndexOffset] = i;

                // Increment the counter for the number of lights in the cluster
                numLightsInCluster = numLightsInCluster + 1u;
            }
        }
    }

    // Store the final number of lights assigned to this cluster
    clusterSet[clusterOffset] = numLightsInCluster;
}