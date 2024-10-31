// TODO-2: implement the light clustering compute shader

@group(${bindGroup_scene}) @binding(0) var<storage> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<uniform> cameraUniforms: CameraUniforms;
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
    if (globalIdx.x >= ${numClustersX} || globalIdx.y >= ${numClustersY} || globalIdx.z >= ${numClustersZ}) {
        return;
    }
    let idx = globalIdx.x + ${numClustersY} * globalIdx.y + ${numClustersY} * ${numClustersZ} * globalIdx.z;
    
    let minX = -1.0 + 2.0 * f32(globalIdx.x) / f32(${numClustersX});
    let maxX = -1.0 + 2.0 * f32(globalIdx.x + 1) / f32(${numClustersX});
    let minY = -1.0 + 2.0 * f32(globalIdx.y) / f32(${numClustersY});
    let maxY = -1.0 + 2.0 * f32(globalIdx.y + 1) / f32(${numClustersY});
    let minZView = -0.1 * exp(f32(globalIdx.z) * log(1000.0 / 0.1) / f32(${numClustersZ}));
    let maxZView = -0.1 * exp(f32(globalIdx.z + 1) * log(1000.0 / 0.1) / f32(${numClustersZ}));
    let minZ = (cameraUniforms.projMat[2][2] * minZView + cameraUniforms.projMat[3][2]) / (cameraUniforms.projMat[2][3] * minZView + cameraUniforms.projMat[3][3]);
    let maxZ = (cameraUniforms.projMat[2][2] * maxZView + cameraUniforms.projMat[3][2]) / (cameraUniforms.projMat[2][3] * maxZView + cameraUniforms.projMat[3][3]);

    var back1 = cameraUniforms.invProjMat * vec4(minX, minY, minZ, 1.0);
    back1 /= back1.w;
    var back2 = cameraUniforms.invProjMat * vec4(maxX, minY, minZ, 1.0);
    back2 /= back2.w;
    var back3 = cameraUniforms.invProjMat * vec4(maxX, maxY, minZ, 1.0);
    back3 /= back3.w;
    var back4 = cameraUniforms.invProjMat * vec4(minX, maxY, minZ, 1.0);
    back4 /= back4.w;

    var front1 = cameraUniforms.invProjMat * vec4(minX, minY, maxZ, 1.0);
    front1 /= front1.w;
    var front2 = cameraUniforms.invProjMat * vec4(maxX, minY, maxZ, 1.0);
    front2 /= front2.w;
    var front3 = cameraUniforms.invProjMat * vec4(maxX, maxY, maxZ, 1.0);
    front3 /= front3.w;
    var front4 = cameraUniforms.invProjMat * vec4(minX, maxY, maxZ, 1.0);
    front4 /= front4.w;

    // :)
    let min = min(min(min(min(min(min(min(back1, back2), back3), back4), front1), front2), front3), front4);
    let max = max(max(max(max(max(max(max(back1, back2), back3), back4), front1), front2), front3), front4);

    let cluster = &clusterSet.clusters[idx];

    var clusterLightCount = 0u;
    let r = f32(${lightRadius});

    for (var i = 0u; i < lightSet.numLights && clusterLightCount < u32(${maxLightsPerCluster}); i++) {
        let currLight = lightSet.lights[i];
        let lightPos = currLight.pos;
        let transformedLightH = cameraUniforms.viewMat * vec4(lightPos, 1.0);
        let transformedLight = transformedLightH.xyzw / transformedLightH.w;

        //https://stackoverflow.com/questions/4578967/cube-sphere-intersection-test/4579069#4579069
        var dist_squared = r * r;
        /* assume min and max are element-wise sorted, if not, do that now */
        if (lightPos.x < min.x) {
            dist_squared -= (lightPos.x - min.x) * (lightPos.x - min.x);
        }
        else if (lightPos.x > max.x) {
            dist_squared -= (lightPos.x - max.x) * (lightPos.x - max.x);
        }

        if (lightPos.y < min.y) {
            dist_squared -= (lightPos.y - min.y) * (lightPos.y - min.y);
        }
        else if (lightPos.y > max.y) {
            dist_squared -= (lightPos.y - max.y) * (lightPos.y - max.y);
        }

        if (lightPos.z < min.z) {
            dist_squared -= (lightPos.z - min.z) * (lightPos.z - min.z);
        }
        else if (lightPos.z > max.z) {
            dist_squared -= (lightPos.z - max.z) * (lightPos.z - max.z);
        }
        
        if (dist_squared > 0.0) {
            cluster.lights[clusterLightCount] = i;
            clusterLightCount++;
        }

    }
    cluster.numLights = clusterLightCount;
}