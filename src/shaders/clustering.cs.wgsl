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

fn getZNDCFromZView(linZ: f32) -> f32 {
    var zndc = ${farZ} * (linZ - ${nearZ});
    zndc /= linZ * (${farZ} - ${nearZ});
    return zndc; 
}

@group(0) @binding(0) var<storage, read> lightSet: LightSet;
@group(0) @binding(1) var<storage, read_write> clusterSet: ClusterSet;
@group(0) @binding(2) var<uniform> camUniforms: CameraUniforms;

@compute
@workgroup_size(${clusterLightsWorkgroupSize}, ${clusterLightsWorkgroupSize}, ${clusterLightsWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u, @builtin(workgroup_id) group_id: vec3u) {
    let numXClusters = clusterSet.numClustersX;
    let numYClusters = clusterSet.numClustersY;
    let numZClusters = clusterSet.numClustersZ;
    let xClusterSize = u32(${clusterSize});
    let yClusterSize = u32(${clusterSize});
    let imageWidth = camUniforms.width;
    let imageHeight = camUniforms.height;


    let totalClustersSize = numXClusters * numYClusters * numZClusters;

    let linearIdx = globalIdx.x * (numYClusters * numZClusters) + globalIdx.y * (numZClusters) + globalIdx.z;
    if (globalIdx.x >= numXClusters || globalIdx.y >= numYClusters || globalIdx.z >= numZClusters) {
        return;
    }

    //these are currently 0 to 1, is that correct?
    let minLinDepth = ${nearZ} + ((f32(globalIdx.z) / f32(numZClusters)) * (${farZ} - ${nearZ}));
    let maxLinDepth = ${nearZ} + ((f32(globalIdx.z + 1) / f32(numZClusters)) * (${farZ} - ${nearZ}));
    //let minNDCDepth = f32(globalIdx.z) / f32(numZClusters);
    //let maxNDCDepth = f32(globalIdx.z + 1) / f32(numZClusters);
    let minNDCDepth = getZNDCFromZView(minLinDepth);
    let maxNDCDepth = getZNDCFromZView(maxLinDepth);

    let minXPix = globalIdx.x * xClusterSize;
    let maxXPix = minXPix + xClusterSize;
    let minYPix = globalIdx.y * yClusterSize;
    let maxYPix = minYPix + yClusterSize;

    //having something like float.max seems to be an outstanding webgpu issue
    let bignum: f32 = 10000.0;

    var AABBVec: array<vec2f, 3> = array<vec2f, 3>(vec2f(bignum, -bignum), vec2f(bignum, -bignum), vec2f(bignum, -bignum));
    let invProjMat = camUniforms.invProjMat; //inverse camera projection matrix

    var ndcPos: vec4f;
    for (var edge: u32 = 0; edge < 8; edge++) {

        // Process each edge of the bounding box
        // You can add your specific logic here
        let xVal = edge & 1u;
        let yVal = (edge >> 1u) & 1u;
        let zVal = (edge >> 2u) & 1u;
        
        //flipping the y as recommended in EdStem
        //leaving the z in 0 to 1 as recommended in EdStem
        ndcPos = vec4f(
            (f32(xVal * xClusterSize + minXPix) / f32(imageWidth)) * 2.0 - 1.0,
            -((f32(yVal * yClusterSize + minYPix ) / f32(imageHeight)) * 2.0 - 1.0), 
            minNDCDepth + f32(zVal) * (maxNDCDepth - minNDCDepth),
            1.0
        );

        var viewPos = invProjMat * ndcPos;
        viewPos /= viewPos.w;

        AABBVec[0] = vec2f(min(AABBVec[0].x, viewPos.x), max(AABBVec[0].y, viewPos.x)); // X bounds
        AABBVec[1] = vec2f(min(AABBVec[1].x, viewPos.y), max(AABBVec[1].y, viewPos.y)); // Y bounds
        AABBVec[2] = vec2f(min(AABBVec[2].x, viewPos.z), max(AABBVec[2].y, viewPos.z)); // Z bounds
    }

    var numClustersAdded = 0;
    let maxClusterLights = ${clusterMaxLights};
    let numLights = lightSet.numLights;
    for(var i: u32 = 0; i < numLights; i++) {
        let lightPos = lightSet.lights[i].pos;
        let lightCamPos4 = camUniforms.viewMat * vec4(lightPos, 1.0);
        //check this, should I be dividing by w?
        let lightCamPos = lightCamPos4.xyz;// / lightCamPos4.w;
        let lightRad = ${lightRadius};

        let closestPoint = vec3f(
            clamp(lightCamPos.x, AABBVec[0].x, AABBVec[0].y),
            clamp(lightCamPos.y, AABBVec[1].x, AABBVec[1].y),
            clamp(lightCamPos.z, AABBVec[2].x, AABBVec[2].y)
        );

        if (length(closestPoint - lightCamPos) < f32(lightRad)) {
            clusterSet.clusters[linearIdx].lights[numClustersAdded] = i;
            numClustersAdded++;
        }
        if (numClustersAdded >= maxClusterLights) {
            break;
        }

    }
    clusterSet.clusters[linearIdx].numLights = u32(numClustersAdded); 
    //clusterSet.clusters[linearIdx].minBoundingBox = vec3f(AABBVec[0].x, AABBVec[1].x, AABBVec[2].x);
    //clusterSet.clusters[linearIdx].maxBoundingBox = vec3f(AABBVec[0].y, AABBVec[1].y, AABBVec[2].y);
    //some printing for testing
    //clusterSet.clusters[linearIdx].maxBoundingBox = vec3f(f32(globalIdx.x)/f32(numXClusters), 0, 0);
    //clusterSet.clusters[linearIdx].maxBoundingBox = vec3f(0, f32(globalIdx.y)/f32(numYClusters), 0);
    //clusterSet.clusters[linearIdx].maxBoundingBox = vec3f(0, 0, f32(globalIdx.z)/f32(numZClusters));
    //clusterSet.clusters[linearIdx].maxBoundingBox = vec3f(f32(numClustersAdded)/f32(maxClusterLights));
    /*
    clusterSet.clusters[linearIdx].maxBoundingBox = vec3f(
        (AABBVec[0].y - AABBVec[0].x) / 100,
        (AABBVec[1].y - AABBVec[1].x) / 100,
        (AABBVec[2].y - AABBVec[2].x) / 100,
    );
    */
    
    /*
    clusterSet.clusters[linearIdx].maxBoundingBox = vec3f(
        f32(AABBVec[0].y - AABBVec[0].x > 20.0),
        f32(AABBVec[1].y - AABBVec[1].x > 20.0),
        f32(AABBVec[2].y - AABBVec[2].x > 50.0),
    );
    */
    /*clusterSet.clusters[linearIdx].maxBoundingBox = vec3f(
        f32(imageHeight/1000),
        f32(0),
        f32(imageWidth/1000),
    );*/
    clusterSet.clusters[linearIdx].maxBoundingBox = vec3f(
        f32(globalIdx.x) / f32(numXClusters),//ndcPos.x,
        f32(globalIdx.y) / f32(numYClusters),//ndcPos.y,
        f32(globalIdx.z) / f32(numZClusters)//f32(minLinDepth)/f32(numZClusters)//f32((ndcPos.z)))
    );
}