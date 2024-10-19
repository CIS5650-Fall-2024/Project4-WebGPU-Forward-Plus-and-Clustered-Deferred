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
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

@compute @workgroup_size(${clusterWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterIndex = globalIdx.x;
    let totalClusters = numClustersX * numClustersY * numClustersZ;
    if (clusterIndex >= totalClusters) {
        return;
    }

    let clusterX = clusterIndex % numClustersX;
    let clusterY = (clusterIndex / numClustersX) % numClustersY;
    let clusterZ = clusterIndex / (numClustersX * numClustersY);

    var lightCount = 0u;
    for (var i = 0u; i < lightSet.numLights; i += 1) {
        let light = lightSet.lights[i];

        var minCornerCluster = vec3u(numClustersX, numClustersY, numClustersZ);
        var maxCornerCluster = vec3u(0);
        for (var a = -1; a <= 1; a += 2) {
            for (var b = -1; b <= 1; b += 2) {
                for (var c = -1; c <= 1; c += 2) {
                    let corner = light.pos + vec3f(
                        f32(a) * ${lightRadius},
                        f32(b) * ${lightRadius},
                        f32(c) * ${lightRadius}
                    );
                    let cornerCluster = getClusterIndex(cameraUniforms, corner);
                    minCornerCluster = min(minCornerCluster, cornerCluster);
                    maxCornerCluster = max(maxCornerCluster, cornerCluster);
                }
            }
        }

        if (minCornerCluster.x <= clusterX && clusterX <= maxCornerCluster.x &&
            minCornerCluster.y <= clusterY && clusterY <= maxCornerCluster.y &&
            minCornerCluster.z <= clusterZ && clusterZ <= maxCornerCluster.z) {
            clusterSet.clusters[clusterIndex].lightIndices[lightCount] = i;
            lightCount += 1;
            if (lightCount >= ${maxLightsPerCluster}) {
                break;
            }
        }
    }

    clusterSet.clusters[clusterIndex].lightCount = lightCount;
}
