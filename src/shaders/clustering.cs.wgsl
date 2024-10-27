@group(${bindGroup_scene}) @binding(0) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> cameraUnifs: CameraUniforms;

@compute
@workgroup_size(${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {

    let clusterIdx = globalIdx.x;
    if (clusterIdx >= clusterSet.numClusters) {
        return;
    }

    CalculateClusterBounds(clusterIdx);
    AssignLightsToClusters(clusterIdx);
}


// TODO-2: implement the light clustering compute shader

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

fn nearToZ(nearPlaneViewSpaceCoord: vec2f, viewSpaceZ: f32) -> vec2f {
    return nearPlaneViewSpaceCoord * (viewSpaceZ / cameraUnifs.nearPlane);
}

fn screenToView(screenSpaceCoord: vec2f) -> vec2f {
    let clipSpaceCoord = vec4f(screenSpaceCoord * 2.0 - 1.0, -1.0, 1.0); //nearplane!
    let viewSpaceCoord = cameraUnifs.invProjMat * clipSpaceCoord;
    let unhomogenized = viewSpaceCoord / viewSpaceCoord.w;
    return unhomogenized.xy;
}

fn CalculateClusterBounds(clusterIdx : u32) {
    //- Calculate the screen-space bounds for this cluster in 2D (XY).

    //clusterIdx = z * (.x * .y) + y * (.x) + x
    let numClustersInSlice = clusterSet.clustersDim.x * clusterSet.clustersDim.y;
    let local = clusterIdx % numClustersInSlice;
    let x = local % clusterSet.clustersDim.x;
    let y = local / clusterSet.clustersDim.x;

    let screenSpaceMin = vec2f(f32(x) / f32(clusterSet.clustersDim.x), f32(y) / f32(clusterSet.clustersDim.y));
    let screenSpaceMax = vec2f(f32(x + 1) / f32(clusterSet.clustersDim.x), f32(y + 1) / f32(clusterSet.clustersDim.y));
    
    let viewSpaceMin = screenToView(screenSpaceMin);
    let viewSpaceMax = screenToView(screenSpaceMax);


    
    //these coords are on the nearplane, relative to 0, 0

    // // //- Calculate the depth bounds for this cluster in Z (near and far planes).
    let z : u32 = clusterIdx / numClustersInSlice; //floored int z

    let nearPlane : f32 = cameraUnifs.nearPlane;
    let farPlane : f32 = cameraUnifs.farPlane;
    let dist : f32 = farPlane - nearPlane;

    let depth_min = -nearPlane * pow(farPlane / nearPlane, f32(z) / f32(clusterSet.clustersDim.z));
    let depth_max = -nearPlane * pow(farPlane / nearPlane, f32(z + 1) / f32(clusterSet.clustersDim.z));

    let minDepth_ViewSpaceMin = nearToZ(viewSpaceMin, -(depth_min));
    let maxDepth_ViewSpaceMin = nearToZ(viewSpaceMin, -(depth_max));
    let minDepth_ViewSpaceMax = nearToZ(viewSpaceMax, -(depth_min));
    let maxDepth_ViewSpaceMax = nearToZ(viewSpaceMax, -(depth_max));

    let minBound = vec3f(min(min(minDepth_ViewSpaceMin, maxDepth_ViewSpaceMin), min(minDepth_ViewSpaceMax, maxDepth_ViewSpaceMax)), depth_max);
    let maxBound = vec3f(max(max(minDepth_ViewSpaceMin, maxDepth_ViewSpaceMin), max(minDepth_ViewSpaceMax, maxDepth_ViewSpaceMax)), depth_min);
    clusterSet.clusters[clusterIdx].minBound = minBound;
    clusterSet.clusters[clusterIdx].maxBound = maxBound;
}

fn IntersectLightAABB(lightPos: vec3f, radius: f32, minBound: vec3f, maxBound: vec3f) -> bool {
    var d_2 : f32 = 0.0;
    let r_2 = radius * radius;
    for (var i = 0; i < 3; i++) {
        let p_i = max(minBound[i], min(lightPos[i], maxBound[i]));
        d_2 += pow(lightPos[i] - p_i, 2);
    }
    
    return d_2 <= r_2;
}
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

fn AssignLightsToClusters(clusterIdx: u32) {
    var counter : u32 = 0u;
    
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let light = lightSet.lights[lightIdx]; //${lightRadius}
        let viewSpaceLightPos : vec4f = cameraUnifs.viewMat * vec4f(light.pos, 1.0f);
        let doesIntersect = IntersectLightAABB(viewSpaceLightPos.xyz, ${lightRadius}, 
                clusterSet.clusters[clusterIdx].minBound,
                clusterSet.clusters[clusterIdx].maxBound);
        if (doesIntersect) {
            clusterSet.clusters[clusterIdx].lights[counter] = lightIdx;
            counter++;
        }

        if (counter >= ${maxLightsPerCluster}) {
            break;
        }
    }
    clusterSet.clusters[clusterIdx].numLights = counter;
}