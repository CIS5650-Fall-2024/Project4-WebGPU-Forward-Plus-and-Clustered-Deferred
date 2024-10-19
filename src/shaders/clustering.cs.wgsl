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

@compute @workgroup_size(16, 9, 1)
fn main(@builtin(global_invocation_id) index: vec3u) {
    if (index.x >= clusterSet.nx || index.y >= clusterSet.ny || index.z >= clusterSet.nz) {
        return;
    }

    let idx = index.x +
              index.y * clusterSet.nx +
              index.z * clusterSet.nx * clusterSet.ny;
    
    // ----------------------
    // Compute cluster bounds
    // ----------------------
    // Prefetch and precomputations
    let epsilon = 1e-5;
    let zNear = cameraUniforms.nearClip;
    let zFar = cameraUniforms.farClip;
    let zIdx = f32(index.z);
    let invProjMat = cameraUniforms.invProjMat;
    let logZFarNearRatio = log(zFar / zNear);
    let clusterDimX = 2.0 / f32(clusterSet.nx);
    let clusterDimY = 2.0 / f32(clusterSet.ny);
    let clusterDimZ = 1.0 / f32(clusterSet.nz);

    // X and Y span in NDC of one cluster
    let minNdcX = -1.0 + f32(index.x) * clusterDimX;
    let minNdcY = -1.0 + f32(index.y) * clusterDimY;
    let maxNdcX = min(minNdcX + clusterDimX, 1.0 - epsilon);
    let maxNdcY = min(minNdcY + clusterDimY, 1.0 - epsilon);

    // Z span in View
    let minViewZ = -zNear * exp(zIdx * logZFarNearRatio * clusterDimZ);
    let maxViewZ = -zNear * exp((zIdx + 1.0) * logZFarNearRatio * clusterDimZ);
    let minNdcZ = viewToNdcZ(minViewZ, cameraUniforms.projMat);
    let maxNdcZ = viewToNdcZ(maxViewZ, cameraUniforms.projMat);
    
    // Retrieve the world coordinates of the frustum
    let vtxLeftBottomNear :  vec3f = ndcToView(minNdcX, minNdcY, minNdcZ, invProjMat);
    let vtxLeftTopNear :     vec3f = ndcToView(minNdcX, maxNdcY, minNdcZ, invProjMat);
    let vtxRightBottomNear : vec3f = ndcToView(maxNdcX, minNdcY, minNdcZ, invProjMat);
    let vtxRightTopNear :    vec3f = ndcToView(maxNdcX, maxNdcY, minNdcZ, invProjMat);
    let vtxLeftBottomFar :   vec3f = ndcToView(minNdcX, minNdcY, maxNdcZ, invProjMat);
    let vtxLeftTopFar :      vec3f = ndcToView(minNdcX, maxNdcY, maxNdcZ, invProjMat);
    let vtxRightBottomFar :  vec3f = ndcToView(maxNdcX, minNdcY, maxNdcZ, invProjMat);
    let vtxRightTopFar :     vec3f = ndcToView(maxNdcX, maxNdcY, maxNdcZ, invProjMat);

    // Simply get AABB of the frustum
    let aabbMinBounds = min(min(min(vtxLeftBottomFar, vtxLeftBottomNear),   min(vtxLeftTopFar, vtxLeftTopNear)), 
                           min(min(vtxRightBottomFar, vtxRightBottomNear), min(vtxRightTopFar, vtxRightTopNear)));
    let aabbMaxBounds = max(max(max(vtxLeftBottomFar, vtxLeftBottomNear),   max(vtxLeftTopFar, vtxLeftTopNear)), 
                           max(max(vtxRightBottomFar, vtxRightBottomNear), max(vtxRightTopFar, vtxRightTopNear)));

    // Add cluster to the set
    clusterSet.clusters[idx].minBounds = aabbMinBounds;
    clusterSet.clusters[idx].maxBounds = aabbMaxBounds;

    // ----------------------
    // Add lights to clusters
    // ----------------------
    var lightCount: u32 = 0;

    for (var i: u32 = 0; i < lightSet.numLights; i++) {
        let light: Light = lightSet.lights[i];
        let lightViewPos = (cameraUniforms.viewMat * vec4(light.pos, 1.0)).xyz;
        if (lightCount >= ${maxLightInCluster}) { break; }
        if (sphereAABBIntersection(lightViewPos, ${lightRadius}, aabbMinBounds, aabbMaxBounds)) {
            clusterSet.clusters[idx].lightIndices[lightCount] = i;
            lightCount++;
        }
    }
    clusterSet.clusters[idx].numLights = lightCount;
}

fn sphereAABBIntersection(pos: vec3f, radius: f32, aabbMinBounds: vec3f, aabbMaxBounds: vec3f) -> bool {
    let neighborPos = clamp(pos, aabbMinBounds, aabbMaxBounds);
    let d = length(pos - neighborPos);
    return d <= radius;
}

fn viewToNdcZ(zView: f32, projMat: mat4x4f) -> f32 {
    return (projMat[2][2] * zView + projMat[3][2]) / (projMat[2][3] * zView + projMat[3][3]);
}

fn ndcToView(x: f32, y: f32, z: f32, invProjMat: mat4x4f) -> vec3f {
    let ndc = vec4(x, y, z, 1.0);
    let view = invProjMat * ndc;
    return view.xyz / view.w;
}