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

@group(${bindGroup_scene}) @binding(0) var<storage, read_write> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

@compute
@workgroup_size(${clusteringWorkgroupSizeX}, ${clusteringWorkgroupSizeY}, ${clusteringWorkgroupSizeZ})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIdx = globalIdx.x + globalIdx.y * ${numClustersX} + globalIdx.z * ${numClustersX} * ${numClustersY};
    if (globalIdx.x >= ${numClustersX} || globalIdx.y >= ${numClustersY} || globalIdx.z >= ${numClustersZ}) {
        return;
    }

    let cluster = &clusterSet.clusters[clusterIdx];
    
    let minX = 2.0 * f32(globalIdx.x) / f32(${numClustersX}) - 1.0;
    let maxX = 2.0 * f32(globalIdx.x + 1) / f32(${numClustersX}) - 1.0;
    let minY = 2.0 * f32(globalIdx.y) / f32(${numClustersY}) - 1.0;
    let maxY = 2.0 * f32(globalIdx.y + 1) / f32(${numClustersY}) - 1.0;
    let minZ = f32(globalIdx.z) / f32(${numClustersZ});
    let maxZ = f32(globalIdx.z + 1) / f32(${numClustersZ});

    var p1 = cameraUniforms.invProjMat * vec4(minX, minY, minZ, 1.0);
    p1 /= p1.w;

    var p2 = cameraUniforms.invProjMat * vec4(maxX, minY, minZ, 1.0);
    p2 /= p2.w;

    var p3 = cameraUniforms.invProjMat * vec4(minX, maxY, minZ, 1.0);
    p3 /= p3.w;

    var p4 = cameraUniforms.invProjMat * vec4(maxX, maxY, minZ, 1.0);
    p4 /= p4.w;

    var p5 = cameraUniforms.invProjMat * vec4(minX, minY, maxZ, 1.0);
    p5 /= p5.w;

    var p6 = cameraUniforms.invProjMat * vec4(maxX, minY, maxZ, 1.0);
    p6 /= p6.w;

    var p7 = cameraUniforms.invProjMat * vec4(minX, maxY, maxZ, 1.0);
    p7 /= p7.w;

    var p8 = cameraUniforms.invProjMat * vec4(maxX, maxY, maxZ, 1.0);
    p8 /= p8.w;

    let minView = (min(p1, min(p2, min(p3, min(p4, min(p5, min(p6, min(p7, p8)))))))).xyz;
    let maxView = (max(p1, max(p2, max(p3, max(p4, max(p5, max(p6, max(p7, p8)))))))).xyz;

    var numLights = 0u;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let light = &lightSet.lights[lightIdx];
        var lightPos = vec4(light.pos, 1.0);
        lightPos = cameraUniforms.invProjMat * (cameraUniforms.viewProjMat * lightPos);
        lightPos /= lightPos.w;
        if (lightSphereIntersectionTest(lightPos.xyz, ${lightRadius}, minView, maxView)) {
        // if (true) {
            if (numLights < ${maxNumClusterLights}) {
                cluster.lights[numLights] = lightIdx;
                numLights = numLights + 1u;
            } else {
                break;
            }
        }
    }
    
    cluster.numLights = numLights;
}